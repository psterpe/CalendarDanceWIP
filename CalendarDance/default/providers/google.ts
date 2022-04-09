import {CalendarDescriptor, EventDescriptor} from '../cdconfig';
import {getCalendarListViaAPI, getCalendarEventsViaAPI} from './shared';
import { DateTime } from 'luxon';

const parseCalendarList = (data) => {
    let result = [];

    for (let i=0; i < data.items.length; i++) {
        // Take calendars user owns, not those to which user subscribes
        if (data.items[i].accessRole.toLowerCase() === 'owner') {
            let calendarDescriptor:CalendarDescriptor = {
                name: data.items[i].summary,
                primary: data.items[i].primary || false,
                id: data.items[i].id,
                email: data.items[i].id,
            };
            result.push(calendarDescriptor);
        }
    }
    return result;
};

const parseCalendarEvents = (data, args):EventDescriptor[] => {
    let events:EventDescriptor[] = [];

    const userTimezone:string = args.tz;

    for (const rawevent of data.items) {

        // Ignore all-day events. For Google, on an all-day event, the start and end objects
        // have a 'date' component, but not a 'dateTime' component

        if (rawevent.start.date) {
            continue;
        }

        let event:EventDescriptor = <EventDescriptor>{};

        const start:string = rawevent.start.dateTime;
        const startMtz = DateTime.fromISO(start, {zone: userTimezone});
        const end:string = rawevent.end.dateTime;
        const endMtz = DateTime.fromISO(end, {zone: userTimezone});

        event.startDate = startMtz;
        event.endDate = endMtz;
        events.push(event);
    }

    return events;
};

export const ProviderConfig = {
    discovery_doc_url: 'https://accounts.google.com/.well-known/openid-configuration',
    oauth_scopes: 'https%3A//www.googleapis.com/auth/calendar.readonly%20' +
                  'https%3A//www.googleapis.com/auth/calendar.events.readonly',
    methods: {
        listcalendars: {
            urls: {
                main: 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
            },
            funcs: {
                get: getCalendarListViaAPI,
                parse: parseCalendarList
            }
        },
        getevents: {
            urls: {
                main: 'https://www.googleapis.com/calendar/v3/calendars/{provider_id}/events?singleEvents=True&timeMin={startDate}T00:00:00Z&timeMax={endDate}T00:00:00Z&orderBy=startTime'
            },
            funcs: {
                get: getCalendarEventsViaAPI,
                parse: parseCalendarEvents
            }
        }
    }
};

