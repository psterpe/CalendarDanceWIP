import * as express from 'express';
import {APIResponse, DANCE_STATE, TFParams, TFTOKEN} from './cdconfig';
import {getDance, getDances, getUserByValue, IDance, IShortUser, IUser} from './dal';
import {Dance} from './dance';

export const router = express.Router();

// Middleware to insist upon a valid session for certain routes. Protected routes are
// those starting with /s/ (meaning "s"ession required).
router.use((req, res, next) => {
    if (req.url.startsWith('/s/')) {
        if (!req.session.userid) {
            res.status(403).send(new APIResponse(false, 'Unauthorized'));
            return;
        }
    }
    next();
});

router.post('/s/initiate', async (req:express.Request, res:express.Response, next) => {
    const sender = req.session.userid;
    const recipientEmail = req.body.recipientEmail;
    const recipientIUser:IUser = (await getUserByValue({field:'email', value:recipientEmail}));

    if (!recipientIUser) {
        res.status(500).send(new APIResponse(false, 'Unknown recipient'));
        return;
    }

    const tftoken:TFTOKEN = req.body.tftoken as TFTOKEN;
    const tfparams:TFParams = req.body.tfparams as TFParams;
    const shortSender:IShortUser = {userid: sender};
    const shortRecipient:IShortUser = {userid: recipientIUser.userid};

    const dance:Dance = new Dance(
        shortSender,
        shortRecipient,
        'now',
        shortRecipient,
        {
            state: DANCE_STATE.INITIATE,
            stateDate: new Date(),
            stateUser: sender,
            tftoken: tftoken,
            tfparams: tfparams
        },
        undefined);
    await dance.save();

    // TODO: Check for errors and respond accordingly in /s/initiate
    res.status(200).send(new APIResponse(true, ''));
});

router.get('/s/poll/:roles', async (req:express.Request, res:express.Response, next) => {
    let dances:IDance[] = await getDances(req.session.userid, req.params.roles);

    // Filter out those in state INITIATE -- we want the scanner service to have a whack at those
    // before we show them to end users.
    dances = dances.filter((idance, idx) => idance.latestState !== DANCE_STATE.INITIATE);
    res.status(200).send(new APIResponse(true, dances));
});

const updateDance = async (userid, danceId, state, stateParams?):Promise<[boolean, string]> => {
    // Update the given dance.
    // If state arg is undefined or null, we modify the latest state of the dance,
    // otherwise, we add a state to the dance.

    const idance:IDance = await getDance(danceId);
    if (idance === undefined) {
        return [false, 'No such dance'];
    }

    const dance:Dance = Dance.fromDb(idance);
    let result;

    if (state === null || state === undefined) {
        dance.history[dance.latestStateIndex] = {...dance.history[dance.latestStateIndex], ...stateParams};
        result = await dance.save();
    }
    else {
        result = await dance.addState(userid, danceId, state, stateParams);
    }
    return [result, ''];
};

router.post('/s/accept', async (req:express.Request, res:express.Response, next) => {
    const danceId = req.body.danceId;

    const [result, reason] = await updateDance(req.session.userid, danceId, DANCE_STATE.ACCEPT, {});
    res.status(result ? 200:401).send(new APIResponse(result, reason));
});
router.post('/s/quit', async (req:express.Request, res:express.Response, next) => {
    const danceId = req.body.danceId;

    const [result, reason] = await updateDance(req.session.userid, danceId, DANCE_STATE.QUIT, {});
    res.status(result ? 200:401).send(new APIResponse(result, reason));
});

router.post('/s/snooze', async (req:express.Request, res:express.Response, next) => {
    const danceId = req.body.danceId;
    const deferral = req.body.deferral[0];  // It's an array in the frontend because /choose needs to send one

    const [result, reason] = await updateDance(req.session.userid, danceId, DANCE_STATE.SNOOZE, {deferral: deferral});
    res.status(result ? 200:401).send(new APIResponse(result, reason));
});

router.post('/s/negotiate', async (req:express.Request, res:express.Response, next) => {
    const danceId = req.body.danceId;
    const proposal = req.body.proposal;

    const [result, reason] = await updateDance(req.session.userid, danceId, DANCE_STATE.NEGOTIATE, {proposal: proposal});
    res.status(result ? 200:401).send(new APIResponse(result, reason));
});

router.post('/s/choose', async (req:express.Request, res:express.Response, next) => {
    const danceId:string = req.body.danceId;
    const choices:number[] = req.body.alternative.map((s) => parseInt(s));
    const key:string = 'choices' + req.body.perspective.charAt(0).toUpperCase() + req.body.perspective.slice(1);
    let stateParams:any = {};
    stateParams[key] = choices;

    const [result, reason] = await updateDance(req.session.userid, danceId, null, stateParams);
    res.status(result ? 200:401).send(new APIResponse(result, reason));
});

