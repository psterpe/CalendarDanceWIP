import {getCalendarListViaAPI, getCalendarEventsViaAPI} from './shared';
import {EventDescriptor} from '../cdconfig';
import { DateTime } from 'luxon';

export const parseCalendarList = (data) => {
    // Extract email from odata.context; we may need the email for subsequent
    // calendar operations. In case we can't find the email, default to an empty string.
    const odata_context = data['@odata.context'];
    const emailRegex = /.*\('(.+)'\).*/;
    const matchResult = odata_context.match(emailRegex);
    let email = '';
    if (matchResult) {
        email = decodeURIComponent(matchResult[1]);
    }

    let calendarList = [];
    for (let i=0; i < data.value.length; i++) {
        const thiscal = data.value[i];
        if (thiscal.canEdit) {
            let calendarDescriptor = {
                name: thiscal.name,
                primary: false,  // Can't tell with MSFT calendars
                id: thiscal.id
            };
            if (email !== '') {
                calendarDescriptor['email'] = email;
            }
            calendarList.push(calendarDescriptor);
        }
    }
    return calendarList;
};

const parseCalendarEvents = (data, args):EventDescriptor[] => {
    let events:EventDescriptor[] = [];

    for (const rawevent of data.value) {
        if (rawevent.isAllDay) {
            continue;
        }

        let event:EventDescriptor = <EventDescriptor>{};

        const start:string = rawevent.start.dateTime;
        const end:string = rawevent.end.dateTime;
        let startMtz, endMtz;

        if (rawevent.start.timeZone === 'UTC') {
            startMtz = DateTime.fromISO(start, {zone: 'utc'}).setZone(args.tz);
        }
        else {
            startMtz = DateTime.fromISO(start, {zone: rawevent.start.timeZone}).setZone(args.tz);
        }

        if (rawevent.end.timeZone === 'UTC') {
            endMtz = DateTime.fromISO(end, {zone: 'utc'}).setZone(args.tz);
        }
        else {
            endMtz = DateTime.fromISO(end, {zone: rawevent.end.timeZone}).setZone(args.tz);
        }

        event.startDate = startMtz;
        event.endDate = endMtz;
        events.push(event);
    }

    return events;
};

export const ProviderConfig = {
    discovery_doc_url: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    oauth_scopes: 'offline_access%20https%3A//graph.microsoft.com/Calendars.Read',
    methods: {
        listcalendars: {
            urls: {
                main: 'https://graph.microsoft.com/v1.0/me/calendars'
            },
            funcs: {
                get: getCalendarListViaAPI,
                parse: parseCalendarList
            },
        },
        getevents: {
            urls: {
                main: 'https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime={startDate}&endDateTime={endDate}'
            },
            funcs: {
                get: getCalendarEventsViaAPI,
                parse: parseCalendarEvents
            },
            nextLink: '@odata.nextLink'
        }
    }
};
