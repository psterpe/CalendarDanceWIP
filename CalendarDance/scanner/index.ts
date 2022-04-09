import {getEnvironment, getUserByValue, IDance, ITimeRange, IUser} from './dal';
import {Firestore} from '@google-cloud/firestore';
import {DateTime} from 'luxon';
import {
    DANCE_STATE,
    SPECIAL_USER_SCANNER,
    TFParams,
    TFTOKEN,
    DANCE_HALF_LIFE_HRS,
    DANCE_END_OF_LIFE_HRS,
    REASON_CODES
} from './cdconfig';
import {TimeFrame, TimeRange} from './timeframe';
import {SlotMap} from './slotmap';
import {Dance} from './dance';
import {cacheSet} from './cache';

const RUNNING_LOCALLY:boolean = process.env.NODE_ENV !== 'production';
const SLEEP = 10 * 1000;

// In dev with PyCharm, run config env variables are not injected into the environment -- don't know why.
// Just putting the variable in the env seems to work, though.
if (RUNNING_LOCALLY) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'calendardance-1d5f3fa7142b.json';
}

cacheSet('RUNNING_LOCALLY', RUNNING_LOCALLY);

getEnvironment()
    .then((env) => {

        // Put env data into cache for other modules
        Object.keys(env).forEach((k) => {
            cacheSet(k, env[k]);
        });

        const db = new Firestore();
        cacheSet('db', db);
        cacheSet('initialized', true);

        // Test that we can reach the database by retrieving a doc.
        const testDocRef = db.collection('dbversion').doc('version_data');
        testDocRef.get()
            .then(async (doc) => {
                console.log(`CD Scanner initializing, dbversion=${doc.data().version}`);

                const dancesCollectionRef = db.collection(`dances`);
                const queryRef = dancesCollectionRef
                    .where('latestState', 'in', [
                        DANCE_STATE.INITIATE
                    ]);

                const doQuery = (qref) => {
                    const p = qref.get();
                    p.then(async (result) => {
                        if (!result.empty) {
                            console.log(`scanner query found ${result.docs.length} docs`);
                            for (const d of result.docs) {
                                let danceData:IDance = d.data();
                                danceData.docId = d.id;
                                const danceObject:Dance = Dance.fromDb(danceData);

                                // TODO: Finish scanner#index (other states)
                                switch (danceData.latestState) {
                                    case DANCE_STATE.INITIATE:
                                        // Get tftoken and tfparams
                                        const tftoken:TFTOKEN = danceData.history[danceData.latestStateIndex].tftoken;
                                        const tfparams:TFParams = danceData.history[danceData.latestStateIndex].tfparams;

                                        // Get sender and recipient (for their timezones and slotmaps)
                                        const dancers:IUser[] = [];
                                        dancers.push(await getUserByValue({
                                            field: 'id',
                                            value: danceData.sender.userid
                                        }));
                                        dancers.push(await getUserByValue({
                                            field: 'id',
                                            value: danceData.recipient.userid
                                        }));

                                        let slotmaps = [];

                                        slotmaps.push(SlotMap.fromDb(dancers[0].slotmap));
                                        slotmaps.push(SlotMap.fromDb(dancers[1].slotmap));

                                        // For a given tftoken and tfparams, you always get the same TimeFrame.
                                        // What we need to intersect is that one TimeFrame with the slotmaps
                                        // of the two parties.

                                        const timeframe = new TimeFrame(tftoken, tfparams);

                                        let overlaps:TimeRange[] = SlotMap.findOverlaps(timeframe, slotmaps);

                                        // If no overlaps, add a FAIL state to the dance. Otherwise, add the overlaps
                                        // to the dance metadata as an array 'options'

                                        if (overlaps.length == 0) {
                                            await danceObject.addState(
                                                SPECIAL_USER_SCANNER,
                                                danceObject.docId,
                                                DANCE_STATE.FAIL,
                                                {reason: REASON_CODES.REASON_FAIL_NO_OVERLAPS});
                                        }
                                        else {
                                            // Sort timeranges in ascending order of start date; this will
                                            // make things easier for the UI
                                            overlaps.sort((a:TimeRange, b:TimeRange) => a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);

                                            await danceObject.addState(
                                                SPECIAL_USER_SCANNER,
                                                danceObject.docId,
                                                DANCE_STATE.CHOOSE,
                                                {options: <Array<ITimeRange>> overlaps.map((tr, i)=>tr.toDb(i))}
                                            );
                                        }
                                        break;
                                    case DANCE_STATE.CHOOSE:
                                        // TODO: Write scanner code for CHOOSE state
                                        // Introduce dance Half Life (HL) and End of Life (EOL) milestones
                                        //   - HL:  24 hours from dance startDate
                                        //   - EOL: 48 hours from dance startDate
                                        //
                                        // Have Both Parties Chosen?
                                        //   NO:
                                        //       calc elapsed time (ET) since startDate
                                        //
                                        //       0  <=  ET  <  HL     no state change
                                        //      HL  <=  ET  <  EOL    remind* parties that haven't chosen
                                        //              ET  >= EOL    KILL
                                        //
                                        //      * "remind" means to set dance metadata remindSender or remindRecipient
                                        //        or both; frontend can then see this and remind user(s) to choose
                                        //
                                        //  YES:
                                        //      Set next state based on # of overlaps in user choices:
                                        //
                                        //      0  overlaps  --  FAIL
                                        //      1  overlap   --> SUCCESS*
                                        //      2+ overlaps  --> SUCCESS (scanner picks one)
                                        //
                                        //      * Need to design metadata for SUCCESS state

                                        // Have both parties chosen?
                                        const choicesSender:number[] = danceObject.history[danceObject.latestStateIndex].choicesSender;
                                        const choicesRecipient:number[] = danceObject.history[danceObject.latestStateIndex].choicesRecipient;

                                        if (choicesSender !== undefined && choicesRecipient !== undefined) {
                                            // How many overlaps in their selections?
                                            const selectionOverlaps:number[] = [choicesSender, choicesRecipient].reduce((a, b) => a.filter(a_val => b.includes(a_val)));

                                            switch (selectionOverlaps.length) {
                                                case 0:
                                                    await danceObject.addState(
                                                        SPECIAL_USER_SCANNER,
                                                        danceObject.docId,
                                                        DANCE_STATE.FAIL,
                                                        {reason: REASON_CODES.REASON_FAIL_NO_COMMON_OPTIONS}
                                                    );
                                                    break;
                                                case 1:
                                                    await danceObject.addState(
                                                        SPECIAL_USER_SCANNER,
                                                        danceObject.docId,
                                                        DANCE_STATE.SUCCESS,
                                                        {when: '***NEED VALUE HERE***'}  // FIXME: need a value
                                                    );
                                                    break;
                                                default:
                                                    break;
                                            }
                                        }

                                        const danceStart = DateTime.fromSeconds(danceData.startDate.seconds);
                                        const hl = danceStart.plus({hours: DANCE_HALF_LIFE_HRS});
                                        const eol = danceStart.plus({hours: DANCE_END_OF_LIFE_HRS});



                                        break;
                                }
                            }
                        }
                        else {
                            console.log('scanner query found 0 docs');
                        }
                        setTimeout(doQuery, SLEEP, queryRef);
                    });

                    return p;
                }

                await doQuery(queryRef);
            })
            .catch(err => {
                console.log(`CD Scanner error getting test document from db: ${err}`);
                throw new Error(err.message);
            });
    })
    .catch((err) => {
        console.log(err);
    });
