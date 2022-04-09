import { Storage } from '@google-cloud/storage';
import {DANCE_STATE, TFTOKEN, DANCE_DEFERRAL, TFParams} from './cdconfig';
import {FieldPath, Timestamp} from '@google-cloud/firestore';
import { cacheGet } from './cache';

export interface IQueryObj {
    field: string;
    value: string;
}

export interface IQueryObjMulti {
    field: string;
    values: string[];
}

export interface ISlotMap {
    startDate: Timestamp;
    lastUpdated: Timestamp;
    data: string;        // Binary string of 0s and 1s
    numbits: number;
    tz: string;
}

export interface IAuthData {
    hash: string;
    password: string;
}

export interface IAuthorization {
    userid?: string;
    provider: string;
    authScheme: string;
    accountid: string;
    authData: IAuthData;
    docId: string;
    data?: any;
}

export interface ICalendar {
    name: string;
    provider: string;
    provider_id: string;
    userid: string;       // Necessary?
    docid: string;
    homesetUrl?: string;
    lastRefreshed: Timestamp;
}

export interface IUser {
    userid: string;  // Doc id from database
    email: string;
    handle: string;
    password: string;
    tz: string;
    lname: string;
    fname: string;
    slotmap: ISlotMap;
    created: Date;
    roles: string[];
    activationCode: string;
    activationExpiration: Date;
    activatedDate: Date;
    deactivatedDate: Date;
    authorizations: [IAuthorization];
    calendars: [ICalendar]
}

export interface IShortUser {
    email?: string;
    userid?: string;
    handle?: string;
    lname?: string;
    fname?: string;
}

export interface IDance {
    docId?: string;
    sender: IShortUser;
    recipient: IShortUser;
    startDate: Timestamp;
    whoseTurn: IShortUser;
    history: Array<IDanceState>;
    latestStateIndex: number;
    latestState: DANCE_STATE;
}

export interface IDanceState {
    state: DANCE_STATE;
    stateDate: Date;
    stateUser: string;  // Just the userid
    tftoken?: TFTOKEN;
    tfparams?: TFParams;
    options?:Array<ITimeRange>;
    choicesSender?: number[];
    choicesRecipient?: number[];
    // For reminders, 1=remind, 2=did it
    remindSender?: number;
    remindRecipient?: number;
}

export interface ITimeRange {
    dbkey: number;
    startDate: Date;
    startHour: number;
    startMinute: number;
    numHours: number;
}

let environment = undefined;

export const getEnvironment = ():Promise<any> => {
    let envdata = {};
    if (environment === undefined) {
        environment = new Promise((resolve, reject) => {
            const storage = new Storage();
            const envbucket = storage.bucket('calendardance.appspot.com');
            const envfile = envbucket.file('environment');

            envfile.download()
                .then((envfile) => {
                    envdata = JSON.parse(envfile.toString());
                    envdata['RUNNING_LOCALLY'] = process.env.NODE_ENV !== 'production';
                    resolve(envdata);
                })
        });
    }
    return environment;
};

async function getSubcollectionDocs<T>(userid:string, collectionName:string):Promise<T[]> {
    const db = await cacheGet('db');
    const collectionRef = db.collection(`users/${userid}/${collectionName}`);
    const querySnapshot = await collectionRef.get();
    let docs:T[] = [];

    for (let d = 0; d < querySnapshot.docs.length; d++) {
        let doc:T = querySnapshot.docs[d].data() as T;
        docs.push(doc);
    }
    return docs;
}

export const getUserByValue = async (queryObj:IQueryObj):Promise<IUser> => {
    const db = await cacheGet('db');
    const userCollectionRef = db.collection('users');

    let queryRef;
    let fieldspec;

    if (queryObj.field === 'id') {
        fieldspec = FieldPath.documentId();
    } else {
        fieldspec = queryObj.field;
    }

    queryRef = userCollectionRef.where(fieldspec, '==', queryObj.value);
    const result = await queryRef.get();
    if (result.empty) {
        return undefined;
    }
    else {
        const d = result.docs[0];

        let udata = {...d.data(), userid: d.id};

        // Add the authorizations subcollection data
        udata['authorizations'] = await getSubcollectionDocs<IAuthorization>(udata.userid, 'authorizations');

        // Add the calendars subcollection data
        udata['calendars'] = await getSubcollectionDocs<ICalendar>(udata.userid, 'calendars');

        return udata;
    }
};

export const getICalendar = async (userid, provider, calname):Promise<ICalendar> => {
    const db = await cacheGet('db');
    const calendarsCollectionRef = db.collection(`users/${userid}/calendars`);
    const queryRef = calendarsCollectionRef
        .where('provider', '==', provider)
        .where('name', '==', calname);
    const result = await queryRef.get();

    if (result.empty) {
        return undefined;
    }
    else {
        const caldoc = result.docs[0];
        return {...caldoc.data(), docid: caldoc.id};
    }
};

export const getShortUser = async (userid:string):Promise<IShortUser> => {
    const db = await cacheGet('db');
    const userCollectionRef = db.collection('users');
    const queryRef = userCollectionRef.doc(userid);
    const result = await queryRef.get();
    if (result.empty) {
        // No user with this userid
        return undefined;
    }
    else {
        const data:IShortUser = result.data() as IShortUser;
        return {
            userid: userid,
            email: data.email,
            handle: data.handle,
            lname: data.lname,
            fname: data.fname
        }
    }
};

export const getDances = async (userid:string, role:string):Promise<IDance[]> => {
    let dances:IDance[] = [];
    let iAmSender:IDance[] = [];
    let iAmRecipient:IDance[] = [];
    let queryRef, result;

    const db = await cacheGet('db');
    const dancesCollectionRef = db.collection(`dances`);

    // Find dances where userid is the sender
    if (role.indexOf('s') != -1) {
        queryRef = dancesCollectionRef
            .where('sender.userid', '==', userid);
        result = await queryRef.get();

        if (!result.empty) {
            for (const d of result.docs) {
                let danceData:IDance = d.data();
                danceData.docId = d.id;
                danceData.sender = await getShortUser(danceData.sender.userid);
                danceData.recipient = await getShortUser(danceData.recipient.userid);
                iAmSender.push(danceData);
            }
        }
    }

    // Sort by startDate ascending
    iAmSender.sort((a, b) => (<any>a.startDate)._seconds - (<any>b.startDate)._seconds);

    // Repeat for where userid is the recipient
    if (role.indexOf('r') != -1) {
        queryRef = dancesCollectionRef
            .where('recipient.userid', '==', userid);
        result = await queryRef.get();

        if (!result.empty) {
            for (const d of result.docs) {
                let danceData:IDance = d.data();
                danceData.docId = d.id;
                danceData.sender = await getShortUser(danceData.sender.userid);
                danceData.recipient = await getShortUser(danceData.recipient.userid);
                iAmRecipient.push(danceData);
            }
        }
    }

    iAmRecipient.sort((a, b) => (<any>a.startDate)._seconds - (<any>b.startDate)._seconds);

    return iAmSender.concat(iAmRecipient);
};

export const getDance = async(danceId:string):Promise<IDance> => {
    const db = await cacheGet('db');
    const docSnapshot = await db.collection(`dances`).doc(danceId).get();
    let idance:IDance = docSnapshot.data();
    idance.docId = docSnapshot.id;

    return idance;
}