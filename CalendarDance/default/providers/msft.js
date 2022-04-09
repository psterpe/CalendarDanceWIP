"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("./shared");
const luxon_1 = require("luxon");
exports.parseCalendarList = (data) => {
    const odata_context = data['@odata.context'];
    const emailRegex = /.*\('(.+)'\).*/;
    const matchResult = odata_context.match(emailRegex);
    let email = '';
    if (matchResult) {
        email = decodeURIComponent(matchResult[1]);
    }
    let calendarList = [];
    for (let i = 0; i < data.value.length; i++) {
        const thiscal = data.value[i];
        if (thiscal.canEdit) {
            let calendarDescriptor = {
                name: thiscal.name,
                primary: false,
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
const parseCalendarEvents = (data, args) => {
    let events = [];
    for (const rawevent of data.value) {
        if (rawevent.isAllDay) {
            continue;
        }
        let event = {};
        const start = rawevent.start.dateTime;
        const end = rawevent.end.dateTime;
        let startMtz, endMtz;
        if (rawevent.start.timeZone === 'UTC') {
            startMtz = luxon_1.DateTime.fromISO(start, { zone: 'utc' }).setZone(args.tz);
        }
        else {
            startMtz = luxon_1.DateTime.fromISO(start, { zone: rawevent.start.timeZone }).setZone(args.tz);
        }
        if (rawevent.end.timeZone === 'UTC') {
            endMtz = luxon_1.DateTime.fromISO(end, { zone: 'utc' }).setZone(args.tz);
        }
        else {
            endMtz = luxon_1.DateTime.fromISO(end, { zone: rawevent.end.timeZone }).setZone(args.tz);
        }
        event.startDate = startMtz;
        event.endDate = endMtz;
        events.push(event);
    }
    return events;
};
exports.ProviderConfig = {
    discovery_doc_url: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    oauth_scopes: 'offline_access%20https%3A//graph.microsoft.com/Calendars.Read',
    methods: {
        listcalendars: {
            urls: {
                main: 'https://graph.microsoft.com/v1.0/me/calendars'
            },
            funcs: {
                get: shared_1.getCalendarListViaAPI,
                parse: exports.parseCalendarList
            },
        },
        getevents: {
            urls: {
                main: 'https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime={startDate}&endDateTime={endDate}'
            },
            funcs: {
                get: shared_1.getCalendarEventsViaAPI,
                parse: parseCalendarEvents
            },
            nextLink: '@odata.nextLink'
        }
    }
};
//# sourceMappingURL=msft.js.map