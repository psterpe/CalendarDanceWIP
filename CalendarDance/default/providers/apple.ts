import {CalendarDescriptor, EventDescriptor} from '../cdconfig';
import * as xmldoc from 'xmldoc';
import * as ical from 'node-ical';
import * as rrule from 'rrule';
import { DateTime } from 'luxon';
import {getCalendarListViaCalDAV, getCalendarEventsViaCalDAV} from './shared';

export const parseCalendarList = (calendarsHref, rawxml) => {
    let result = [];

    const doc:xmldoc.XmlDocument = new xmldoc.XmlDocument(rawxml);
    for (const responseNode of doc.childrenNamed('response')) {
        const status = responseNode.valueWithPath('propstat.status');
        if (status.indexOf('200 OK') != -1) {
            const displayname = responseNode.valueWithPath('propstat.prop.displayname');
            const resourcetype = responseNode.descendantWithPath('propstat.prop.resourcetype');
            const calhref = responseNode.childNamed('href').val;

            // Ignore if there's no name or if this appears to be a -reminders calendar
            if (!displayname || !resourcetype || calhref.endsWith('-reminders/')) {
                continue;
            }

            // Just keep the real calendars, not those user is subscribed to
            if (resourcetype.childNamed('calendar')) {
                let calendarDescriptor:CalendarDescriptor = {
                    name: displayname,
                    primary: false,           // With iCloud, we can't tell
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

const parseCalendarEvents = (rawxml, args):EventDescriptor[] => {
    let events:EventDescriptor[] = [];
    const userTz = args.tz;

    const xmlResponseDoc = new xmldoc.XmlDocument(rawxml);
    const responses = xmlResponseDoc.childrenNamed('response');
    for (const response of responses) {
        const vcalendar = response.valueWithPath('propstat.prop.calendar-data');

        // Now extract event specifics from vcalendar
        const eventdata = ical.sync.parseICS(vcalendar);
        for (let key in eventdata) {
            const eventObj = eventdata[key];
            let startsAndEnds = [];

            if (eventObj.datetype === 'date-time') {
                // Add the eventObj to our startsAndEnds list. Then handle any occurrences from the rrule.
                const startMoment:DateTime = DateTime.fromISO(eventObj.start, {zone: userTz});
                const endMoment:DateTime = DateTime.fromISO(eventObj.end, {zone: userTz});
                startsAndEnds.push([startMoment, endMoment]);

                if (eventObj.rrule) {
                    // Handle recurrence rule. Recurring events can be infinite,
                    // so we don't want ALL occurrences. The range we care about is
                    // present in the args as startDate and endDate.

                    // Occurrences reflect only the start of the event. We can use the eventObj
                    // start and end to determine the duration and from that, compute the end
                    // of an occurrence. This lets us represent all events with a start and end
                    // date.

                    const duration = endMoment.diff(startMoment);
                    for (const occurrence of (eventObj.rrule.between(args.startDate.toDate(), args.endDate.toDate(), false))) {
                        const occurrenceStart = DateTime.fromISO(occurrence, {zone: userTz});
                        const occurrenceEnd = occurrenceStart.plus(duration);

                        startsAndEnds.push([occurrenceStart, occurrenceEnd]);
                    }
                }
            }

            for (const startEndPair of startsAndEnds) {
                let event: EventDescriptor = <EventDescriptor>{};

                event.startDate = startEndPair[0];
                event.endDate = startEndPair[1];
                events.push(event);
            }
        }
    }

    return events;
};

export const ProviderConfig = {
    discovery_doc_url: undefined,
    methods: {
        listcalendars: {
            urls: {
                main: 'https://caldav.icloud.com',
                homeset: 'https://caldav.icloud.com'
            },
            funcs: {
                get: getCalendarListViaCalDAV,
                parse: parseCalendarList
            },
        },
        getevents: {
            urls: {
                main: '???'
            },
            funcs: {
                get: getCalendarEventsViaCalDAV,
                parse: parseCalendarEvents
            }
        }
    }
};
