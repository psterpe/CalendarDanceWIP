"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const cdconfig_1 = require("./cdconfig");
const cache_1 = require("./cache");
class Dance {
    constructor(sender, recipient, startDate, whoseTurn, initialData, history, docId = undefined) {
        this.docId = undefined;
        const now = new Date();
        this.sender = sender;
        this.recipient = recipient;
        this.whoseTurn = whoseTurn;
        this.startDate = startDate === 'now' ? now : startDate;
        if (history) {
            this.history = history;
            this.latestState = history[history.length - 1].state;
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
    static fromDb(idance) {
        return new Dance(idance.sender, idance.recipient, new Date(idance.startDate._seconds * 1000), idance.whoseTurn, undefined, idance.history, idance.docId);
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield cache_1.cacheGet('db');
            const dancesCollectionRef = db.collection(`dances`);
            let danceDocRef;
            let dbmethod;
            if (this.docId) {
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
        });
    }
    addState(userid, danceId, state, stateParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const newState = Object.assign({ state: state, stateDate: now, stateUser: userid }, stateParams);
            this.history.push(newState);
            if (userid !== cdconfig_1.SPECIAL_USER_SCANNER) {
                const players = [this.sender, this.recipient];
                this.whoseTurn = this.whoseTurn.userid === players[0].userid ? players[1] : players[0];
            }
            this.latestStateIndex = this.history.length - 1;
            this.latestState = state;
            return yield this.save();
        });
    }
}
exports.Dance = Dance;
//# sourceMappingURL=dance.js.map