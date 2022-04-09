"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const xmldoc = require("xmldoc");
const ical = require("node-ical");
const luxon_1 = require("luxon");
const shared_1 = require("./shared");
exports.parseCalendarList = (calendarsHref, rawxml) => {
    let result = [];
    const doc = new xmldoc.XmlDocument(rawxml);
    for (const responseNode of doc.childrenNamed('response')) {
        const status = responseNode.valueWithPath('propstat.status');
        if (status.indexOf('200 OK') != -1) {
            const displayname = responseNode.valueWithPath('propstat.prop.displayname');
            const resourcetype = responseNode.descendantWithPath('propstat.prop.resourcetype');
            const calhref = responseNode.childNamed('href').val;
            if (!displayname || !resourcetype || calhref.endsWith('-reminders/')) {
                continue;
            }
            if (resourcetype.childNamed('calendar')) {
                let calendarDescriptor = {
                    name: displayname,
                    primary: false,
                    id: calhref,
                    email: '',
                    homesetUrl: calendarsHref
                };
                result.push(calendarDescriptor);
            }
        }
    }
    return result;
};
const parseCalendarEvents = (rawxml, args) => {
    let events = [];
    const userTz = args.tz;
    const xmlResponseDoc = new xmldoc.XmlDocument(rawxml);
    const responses = xmlResponseDoc.childrenNamed('response');
    for (const response of responses) {
        const vcalendar = response.valueWithPath('propstat.prop.calendar-data');
        const eventdata = ical.sync.parseICS(vcalendar);
        for (let key in eventdata) {
            const eventObj = eventdata[key];
            let startsAndEnds = [];
            if (eventObj.datetype === 'date-time') {
                const startMoment = luxon_1.DateTime.fromISO(eventObj.start, { zone: userTz });
                const endMoment = luxon_1.DateTime.fromISO(eventObj.end, { zone: userTz });
                startsAndEnds.push([startMoment, endMoment]);
                if (eventObj.rrule) {
                    const duration = endMoment.diff(startMoment);
                    for (const occurrence of (eventObj.rrule.between(args.startDate.toDate(), args.endDate.toDate(), false))) {
                        const occurrenceStart = luxon_1.DateTime.fromISO(occurrence, { zone: userTz });
                        const occurrenceEnd = occurrenceStart.plus(duration);
                        startsAndEnds.push([occurrenceStart, occurrenceEnd]);
                    }
                }
            }
            for (const startEndPair of startsAndEnds) {
                let event = {};
                event.startDate = startEndPair[0];
                event.endDate = startEndPair[1];
                events.push(event);
            }
        }
    }
    return events;
};
exports.ProviderConfig = {
    discovery_doc_url: undefined,
    methods: {
        listcalendars: {
            urls: {
                main: 'https://caldav.icloud.com',
                homeset: 'https://caldav.icloud.com'
            },
            funcs: {
                get: shared_1.getCalendarListViaCalDAV,
                parse: exports.parseCalendarList
            },
        },
        getevents: {
            urls: {
                main: '???'
            },
            funcs: {
                get: shared_1.getCalendarEventsViaCalDAV,
                parse: parseCalendarEvents
            }
        }
    }
};
//# sourceMappingURL=apple.js.map