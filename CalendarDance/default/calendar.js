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
const cache_1 = require("./cache");
const luxon_1 = require("luxon");
class Calendar {
    constructor(userid, provider, provider_id, name, homesetUrl, docId = undefined, lastRefreshed = undefined) {
        this.docId = undefined;
        this.userid = userid;
        this.provider = provider;
        this.provider_id = provider_id;
        this.name = name;
        this.docId = docId;
        this.homesetUrl = homesetUrl || '';
        this.lastRefreshed = lastRefreshed;
    }
    static fromDb(ical) {
        const cal = new Calendar(ical.userid, ical.provider, ical.provider_id, ical.name, ical.homesetUrl, ical.docid, ical.lastRefreshed);
        return cal;
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield cache_1.cacheGet('db');
            const calendarsCollectionRef = db.collection(`users/${this.userid}/calendars`);
            const calQuery = calendarsCollectionRef.where('provider', '==', this.provider);
            const calDocQuerySnapshot = yield calQuery.get();
            let calDocRef;
            const matching_cal = calDocQuerySnapshot.docs.find(cal => cal.data().provider === this.provider && cal.data().name === this.name);
            if (matching_cal === undefined) {
                calDocRef = calendarsCollectionRef.doc();
                yield calDocRef.set({
                    userid: this.userid,
                    provider: this.provider,
                    provider_id: this.provider_id,
                    name: this.name,
                    homesetUrl: this.homesetUrl,
                    lastRefreshed: luxon_1.DateTime.local()
                });
            }
            else {
                calDocRef = matching_cal.ref;
                calDocRef.update({
                    userid: this.userid,
                    provider: this.provider,
                    provider_id: this.provider_id,
                    name: this.name,
                    homesetUrl: this.homesetUrl,
                    lastRefreshed: this.lastRefreshed
                });
            }
            return true;
        });
    }
    static list(userid) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield cache_1.cacheGet('db');
            const calendarsCollectionRef = db.collection(`users/${userid}/calendars`);
            const calDocQuerySnapshot = yield calendarsCollectionRef.get();
            let result = [];
            for (const docSnapshot of calDocQuerySnapshot.docs) {
                const caldoc = docSnapshot.data();
                const ical = {
                    name: caldoc.name,
                    provider: caldoc.provider,
                    provider_id: caldoc.provider_id,
                    userid: caldoc.userid,
                    docid: docSnapshot.id,
                    homesetUrl: docSnapshot.homesetUrl,
                    lastRefreshed: caldoc.lastRefreshed
                };
                result.push(ical);
            }
            return result;
        });
    }
    static drop(userid, provider, calname) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const db = yield cache_1.cacheGet('db');
                const calendarsCollectionRef = db.collection(`users/${userid}/calendars`);
                const calQuery = calendarsCollectionRef
                    .where('provider', '==', provider)
                    .where('name', '==', calname);
                const calDocQuerySnapshot = yield calQuery.get();
                yield calDocQuerySnapshot.docs[0].ref.delete();
                return true;
            }
            catch (_a) {
                return false;
            }
        });
    }
}
exports.Calendar = Calendar;
//# sourceMappingURL=calendar.js.map