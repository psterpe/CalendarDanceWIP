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
exports.getDance = exports.getDances = exports.getShortUser = exports.getICalendar = exports.getUserByValue = exports.getEnvironment = void 0;
const storage_1 = require("@google-cloud/storage");
const firestore_1 = require("@google-cloud/firestore");
const cache_1 = require("./cache");
let environment = undefined;
exports.getEnvironment = () => {
    let envdata = {};
    if (environment === undefined) {
        environment = new Promise((resolve, reject) => {
            const storage = new storage_1.Storage();
            const envbucket = storage.bucket('calendardance.appspot.com');
            const envfile = envbucket.file('environment');
            envfile.download()
                .then((envfile) => {
                envdata = JSON.parse(envfile.toString());
                envdata['RUNNING_LOCALLY'] = process.env.NODE_ENV !== 'production';
                resolve(envdata);
            });
        });
    }
    return environment;
};
function getSubcollectionDocs(userid, collectionName) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield cache_1.cacheGet('db');
        const collectionRef = db.collection(`users/${userid}/${collectionName}`);
        const querySnapshot = yield collectionRef.get();
        let docs = [];
        for (let d = 0; d < querySnapshot.docs.length; d++) {
            let doc = querySnapshot.docs[d].data();
            docs.push(doc);
        }
        return docs;
    });
}
exports.getUserByValue = (queryObj) => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield cache_1.cacheGet('db');
    const userCollectionRef = db.collection('users');
    let queryRef;
    let fieldspec;
    if (queryObj.field === 'id') {
        fieldspec = firestore_1.FieldPath.documentId();
    }
    else {
        fieldspec = queryObj.field;
    }
    queryRef = userCollectionRef.where(fieldspec, '==', queryObj.value);
    const result = yield queryRef.get();
    if (result.empty) {
        return undefined;
    }
    else {
        const d = result.docs[0];
        let udata = Object.assign(Object.assign({}, d.data()), { userid: d.id });
        udata['authorizations'] = yield getSubcollectionDocs(udata.userid, 'authorizations');
        udata['calendars'] = yield getSubcollectionDocs(udata.userid, 'calendars');
        return udata;
    }
});
exports.getICalendar = (userid, provider, calname) => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield cache_1.cacheGet('db');
    const calendarsCollectionRef = db.collection(`users/${userid}/calendars`);
    const queryRef = calendarsCollectionRef
        .where('provider', '==', provider)
        .where('name', '==', calname);
    const result = yield queryRef.get();
    if (result.empty) {
        return undefined;
    }
    else {
        const caldoc = result.docs[0];
        return Object.assign(Object.assign({}, caldoc.data()), { docid: caldoc.id });
    }
});
exports.getShortUser = (userid) => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield cache_1.cacheGet('db');
    const userCollectionRef = db.collection('users');
    const queryRef = userCollectionRef.doc(userid);
    const result = yield queryRef.get();
    if (result.empty) {
        return undefined;
    }
    else {
        const data = result.data();
        return {
            userid: userid,
            email: data.email,
            handle: data.handle,
            lname: data.lname,
            fname: data.fname
        };
    }
});
exports.getDances = (userid, role) => __awaiter(void 0, void 0, void 0, function* () {
    let dances = [];
    let iAmSender = [];
    let iAmRecipient = [];
    let queryRef, result;
    const db = yield cache_1.cacheGet('db');
    const dancesCollectionRef = db.collection(`dances`);
    if (role.indexOf('s') != -1) {
        queryRef = dancesCollectionRef
            .where('sender.userid', '==', userid);
        result = yield queryRef.get();
        if (!result.empty) {
            for (const d of result.docs) {
                let danceData = d.data();
                danceData.docId = d.id;
                danceData.sender = yield exports.getShortUser(danceData.sender.userid);
                danceData.recipient = yield exports.getShortUser(danceData.recipient.userid);
                iAmSender.push(danceData);
            }
        }
    }
    iAmSender.sort((a, b) => a.startDate._seconds - b.startDate._seconds);
    if (role.indexOf('r') != -1) {
        queryRef = dancesCollectionRef
            .where('recipient.userid', '==', userid);
        result = yield queryRef.get();
        if (!result.empty) {
            for (const d of result.docs) {
                let danceData = d.data();
                danceData.docId = d.id;
                danceData.sender = yield exports.getShortUser(danceData.sender.userid);
                danceData.recipient = yield exports.getShortUser(danceData.recipient.userid);
                iAmRecipient.push(danceData);
            }
        }
    }
    iAmRecipient.sort((a, b) => a.startDate._seconds - b.startDate._seconds);
    return iAmSender.concat(iAmRecipient);
});
exports.getDance = (danceId) => __awaiter(void 0, void 0, void 0, function* () {
    const db = yield cache_1.cacheGet('db');
    const docSnapshot = yield db.collection(`dances`).doc(danceId).get();
    let idance = docSnapshot.data();
    idance.docId = docSnapshot.id;
    return idance;
});
//# sourceMappingURL=dal.js.map