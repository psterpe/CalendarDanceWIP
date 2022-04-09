import {DANCE_STATE, SPECIAL_USER_SCANNER} from './cdconfig';
import { IDance, IDanceState, IShortUser} from './dal';
import { cacheGet } from './cache';

export class Dance {
    docId?: string = undefined;    // Db doc id
    sender: IShortUser;
    recipient: IShortUser;
    startDate: Date;
    whoseTurn: IShortUser;
    latestStateIndex: number; // Index into history
    latestState: DANCE_STATE;
    history: IDanceState[];

    constructor(sender:IShortUser,
                recipient:IShortUser,
                startDate: string|Date,
                whoseTurn:IShortUser,
                initialData: IDanceState|undefined,
                history:IDanceState[]|undefined,    // undefined if reconstructing from db,
                docId=undefined) {                  // undefined if reconstructing from db,

        //   Param        Value if constructing new     Value if reconstructing from db
        //   --------------------------------------------------------------------------
        //   startDate    'now'                         supply date converted from db Timestamp
        //   initialData  supply                        leave undefined
        //   history      leave undefined               supply
        //   docId        leave undefined               supply

        const now:Date = new Date();

        this.sender = sender;
        this.recipient = recipient;
        this.whoseTurn = whoseTurn;

        this.startDate = startDate === 'now' ? now : startDate as Date;

        if (history) {
            this.history = history;
            this.latestState = history[history.length -1].state;
            this.latestStateIndex = this.history.length - 1;
        }
        else {
            this.history = [initialData];
            this.latestState = initialData.state;
            this.latestStateIndex = 0;
        }

        if (docId) {
            this.docId = docId;
        }
    }

    public static fromDb(idance:IDance):Dance {
        return new Dance(
            idance.sender,
            idance.recipient,
            new Date((<any>idance.startDate)._seconds * 1000),
            idance.whoseTurn,
            undefined,
            idance.history,
            idance.docId);
    }

    public async save():Promise<boolean> {
        const db = await cacheGet('db');
        const dancesCollectionRef = db.collection(`dances`);
        let danceDocRef;
        let dbmethod;

        // Are we updating an existing dance or adding a new one?
        if (this.docId) {
            // Updating existing
            danceDocRef = dancesCollectionRef.doc(this.docId);
            dbmethod = 'update';
        }
        else {
            danceDocRef = dancesCollectionRef.doc();
            dbmethod = 'set';
        }

        danceDocRef[dbmethod]({
            sender: this.sender,
            recipient: this.recipient,
            startDate: this.startDate,
            whoseTurn: this.whoseTurn,
            latestStateIndex: this.latestStateIndex,
            latestState: this.latestState,
            history: this.history
        });

        return true;
    }

    public async addState(userid:string, danceId:string, state:DANCE_STATE, stateParams:any):Promise<boolean> {

        const now = new Date();
        const newState:IDanceState = {
            state: state,
            stateDate: now,
            stateUser: userid,
            ...stateParams
        };

        this.history.push(newState);

        // Adjust idea of whose turn it is by alternating. This is naive, e.g., if the state is terminal,
        // there really is no next turn.
        // DO NOT force an alternation if the stateUser is SPECIAL_USER_SCANNER -- CalendarDance has
        // intervened with options (or the info that there are no options), but this does not count
        // as a ping or a pong in the ping-pong of whose turn it is.
        if (userid !== SPECIAL_USER_SCANNER) {
            const players = [this.sender, this.recipient];
            this.whoseTurn = this.whoseTurn.userid === players[0].userid ? players[1] : players[0];
        }

        this.latestStateIndex = this.history.length - 1;
        this.latestState = state;
        return await this.save();
    }
}

