"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("./shared");
const luxon_1 = require("luxon");
const parseCalendarList = (data) => {
    let result = [];
    for (let i = 0; i < data.items.length; i++) {
        if (data.items[i].accessRole.toLowerCase() === 'owner') {
            let calendarDescriptor = {
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
const parseCalendarEvents = (data, args) => {
    let events = [];
    const userTimezone = args.tz;
    for (const rawevent of data.items) {
        if (rawevent.start.date) {
            continue;
        }
        let event = {};
        const start = rawevent.start.dateTime;
        const startMtz = luxon_1.DateTime.fromISO(start, { zone: userTimezone });
        const end = rawevent.end.dateTime;
        const endMtz = luxon_1.DateTime.fromISO(end, { zone: userTimezone });
        event.startDate = startMtz;
        event.endDate = endMtz;
        events.push(event);
    }
    return events;
};
exports.ProviderConfig = {
    discovery_doc_url: 'https://accounts.google.com/.well-known/openid-configuration',
    oauth_scopes: 'https%3A//www.googleapis.com/auth/calendar.readonly%20' +
        'https%3A//www.googleapis.com/auth/calendar.events.readonly',
    methods: {
        listcalendars: {
            urls: {
                main: 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
            },
            funcs: {
                get: shared_1.getCalendarListViaAPI,
                parse: parseCalendarList
            }
        },
        getevents: {
            urls: {
                main: 'https://www.googleapis.com/calendar/v3/calendars/{provider_id}/events?singleEvents=True&timeMin={startDate}T00:00:00Z&timeMax={endDate}T00:00:00Z&orderBy=startTime'
            },
            funcs: {
                get: shared_1.getCalendarEventsViaAPI,
                parse: parseCalendarEvents
            }
        }
    }
};
//# sourceMappingURL=google.js.map