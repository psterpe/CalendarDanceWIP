import {CALENDAR_PROVIDER} from './cdconfig';
import { ICalendar} from './dal';
import { cacheGet } from './cache';
import { DateTime } from 'luxon';

export class Calendar {
    docId: string = undefined;    // Db doc id
    userid: string;
    provider: CALENDAR_PROVIDER;
    provider_id: string;          // Provider's internal id
    name: string;
    homesetUrl?: string;
    lastRefreshed: DateTime;

    constructor(userid:string, provider:CALENDAR_PROVIDER, provider_id:string, name:string, homesetUrl:string, docId=undefined, lastRefreshed=undefined) {
        this.userid = userid;
        this.provider = provider;
        this.provider_id = provider_id;
        this.name = name;
        this.docId = docId;
        this.homesetUrl = homesetUrl || '';  // Cannot send undefined to db
        this.lastRefreshed = lastRefreshed;
    }

    public static fromDb(ical:ICalendar):Calendar {
        const cal = new Calendar(
            ical.userid,
            ical.provider as CALENDAR_PROVIDER,
            ical.provider_id,
            ical.name,
            ical.homesetUrl,
            ical.docid,
            ical.lastRefreshed as any as DateTime);
        return cal;
    }

    public async save():Promise<boolean> {
        const db = await cacheGet('db');
        const calendarsCollectionRef = db.collection(`users/${this.userid}/calendars`);
        const calQuery = calendarsCollectionRef.where('provider', '==', this.provider);
        const calDocQuerySnapshot = await calQuery.get();

        let calDocRef;
        // Are we updating an existing calendar or adding a new one?
        const matching_cal = calDocQuerySnapshot.docs.find(cal => cal.data().provider === this.provider && cal.data().name === this.name);
        if (matching_cal === undefined) {
            // Add a calendar doc
            calDocRef = calendarsCollectionRef.doc();
            await calDocRef.set({
                userid: this.userid,
                provider: this.provider,
                provider_id: this.provider_id,
                name: this.name,
                homesetUrl: this.homesetUrl,
                lastRefreshed: DateTime.local()
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
            })
        }

        return true;
    }

    public static async list(userid:string):Promise<ICalendar[]> {
        const db = await cacheGet('db');
        const calendarsCollectionRef = db.collection(`users/${userid}/calendars`);
        const calDocQuerySnapshot = await calendarsCollectionRef.get();

        let result:ICalendar[] = [];

        for (const docSnapshot of calDocQuerySnapshot.docs) {
            const caldoc = docSnapshot.data();
            const ical:ICalendar = {
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
    }

    public static async drop(userid:string, provider:string, calname:string):Promise<boolean> {
        try {
            const db = await cacheGet('db');
            const calendarsCollectionRef = db.collection(`users/${userid}/calendars`);
            const calQuery = calendarsCollectionRef
                .where('provider', '==', provider)
                .where('name', '==', calname);
            const calDocQuerySnapshot = await calQuery.get();
            await calDocQuerySnapshot.docs[0].ref.delete();
            return true;
        }
        catch {
            return false;
        }
    }
}

