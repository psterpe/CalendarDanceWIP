import {ReturnedData, SLOTMAP_FETCH} from '../cdconfig';
import {AuthObject} from '../auth';
import {IUser, getUserByValue} from '../dal';

import * as xmldoc from 'xmldoc';
import * as fetch from 'node-fetch';
import { DateTime } from 'luxon';

export async function getCalendarListViaAPI(args):Promise<ReturnedData> {
    const headerData = {
        'Authorization' : `Bearer ${args.data.accessToken}`
    };

    const response = await fetch(
        args.methods.listcalendars.urls.main, {
            method: 'get',
            headers: headerData
        });


    let returnObject:ReturnedData = {
        OK: true,
        reason: undefined,
        data: undefined
    };

    const responseData = await response.json();

    // Fetch could fail if token was revoked or has expired. Check for this.
    if (responseData.error) {
        returnObject.OK = false;
        returnObject.reason = `Code: ${responseData.error.code}, Reason: ${responseData.error.message}`;
    }
    else {
        // At this point, response is OK, so let's parse it and return a list of calendars.
        returnObject.data = args.methods.listcalendars.funcs.parse(responseData);
    }
    return returnObject;
}

export async function getCalendarListViaCalDAV(args):Promise<ReturnedData> {
    // TODO: Check fetch responses for error in case password has been changed or revoked

    let returnObject:ReturnedData = {
        OK: true,
        reason: undefined,
        data: undefined
    };

    const pwClear = AuthObject.basicPasswordEncryptDecrypt('d', args.userid, args.data.hash, args.data.password);

    const credsBase64 = Buffer.from(args.accountid + ':' + pwClear).toString('base64');
    let header = {
        Authorization: 'Basic ' + credsBase64,
        Depth: 0
    };

    let body = `
<propfind xmlns='DAV:'>
  <prop>
    <current-user-principal/>
  </prop>
</propfind>`;

    // Start with a current-user-principal request
    let url = args.methods.listcalendars.urls.main;
    let response = await fetch(
        url, {
            method: 'propfind',
            headers: header,
            body: body
        });

    // Parse the response
    let doc = new xmldoc.XmlDocument(await response.text());
    const principalHref = doc.valueWithPath('response.propstat.prop.current-user-principal.href');

    // Next do a calendar-home-set request
    body = `
<propfind xmlns='DAV:' xmlns:cd='urn:ietf:params:xml:ns:caldav'>
  <prop>
    <cd:calendar-home-set/>
  </prop>
</propfind>`;
    url = args.methods.listcalendars.urls.homeset + principalHref;
    response = await fetch(
        url, {
            method: 'propfind',
            headers: header,
            body: body
        });

    // Parse the response
    doc = new xmldoc.XmlDocument(await response.text());
    const calendarsHref = doc.valueWithPath('response.propstat.prop.calendar-home-set.href');

    // Get calendar names with a displayname query to the calendarsHref URI
    // Depth header needs to be 1 for this CalDAV query
    body = `
<propfind xmlns='DAV:'>
  <prop>
    <displayname/>
    <resourcetype/>
  </prop>
</propfind>`;
    url = calendarsHref;
    header.Depth = 1;

    response = await fetch(
        url, {
            method: 'propfind',
            headers: header,
            body: body
        });
    const rawCalendarList = await response.text();

    // From calendarsHref, we want only the origin
    let calendarsHrefOrigin = new URL(calendarsHref).origin;

    returnObject.data = args.methods.listcalendars.funcs.parse(calendarsHrefOrigin, rawCalendarList);

    return returnObject;
}

export async function getCalendarEventsViaAPI(args):Promise<ReturnedData> {
    const headerData = {
        'Authorization' : `Bearer ${args.data.accessToken}`
    };

    let iuser:IUser = (await getUserByValue({field: 'id', value: args.userid}));

    const startDate = DateTime.local().setZone(iuser.tz).startOf('day');
    const endDate = startDate.plus({days: SLOTMAP_FETCH});

    // Substitute some values for placeholders in the url. Note that for provider_id,
    // we don't want "Google" or "Microsoft." In this case, the provider_id means the
    // provider's id for the user whose calendar it is, e.g., Google thinks I am
    // "pjsmit84@gmail.com".
    let url = args.methods.getevents.urls.main;
    url = url.replace('{startDate}', startDate.toFormat('yyyy-MM-dd'));
    url = url.replace('{endDate}', endDate.toFormat('yyyy-MM-dd'));

    // User might have multiple calendars with the given provider
    const calendar_set = args.calname === '-ALL-' ?
        iuser.calendars.filter((icalendar) => {
            if (icalendar.provider === args.provider) {
                return icalendar;
            }
        }) :
        iuser.calendars.filter((icalendar) => {
           if (icalendar.provider === args.provider && icalendar.name === args.calname) {
               return icalendar;
           }
        });

    let returnObject:ReturnedData = {
        OK: true,
        reason: undefined,
        data: []
    };

    for (let i=0; i < calendar_set.length; i++) {
        let calendar_url = url.replace('{provider_id}', calendar_set[i].provider_id);
        let morePages = true;

        while (morePages) {
            const response = await fetch(
                calendar_url, {
                    method: 'get',
                    headers: headerData
                });

            const responseData = await response.json();

            // Fetch could fail if token was revoked or has expired. Check for this.
            if (responseData.error) {
                returnObject.OK = false;
                returnObject.reason = `Code: ${responseData.error.code}, Reason: ${responseData.error.message}`;
                return returnObject;
            } else {
                // At this point, response is OK, so let's parse it. Also see if this provider
                // paginates the results in case we have to go back for more.
                if (args.methods.getevents.nextLink) {
                    calendar_url = responseData[args.methods.getevents.nextLink];
                    if (calendar_url === undefined) {
                        morePages = false;
                    }
                }
                else {
                    morePages = false;
                }

                // Parse and keep what we have so far
                returnObject.data = returnObject.data.concat(args.methods.getevents.funcs.parse(responseData, {...args, ...iuser}));
            }
        }
    }
    return returnObject;
}

export async function getCalendarEventsViaCalDAV(args):Promise<ReturnedData> {
    let returnObject:ReturnedData = {
        OK: true,
        reason: undefined,
        data: undefined
    };

    const pwClear = AuthObject.basicPasswordEncryptDecrypt('d', args.userid, args.data.hash, args.data.password);

    const credsBase64 = Buffer.from(args.accountid + ':' + pwClear).toString('base64');
    let header = {
        Authorization: 'Basic ' + credsBase64,
        Depth: 0
    };

    let iuser:IUser = (await getUserByValue({field: 'id', value: args.userid}));

    // CalDAV wants UTC (Zulu) timestamps. Add these dates to the args payload so the event
    // parser can limit infinitely recurring events to the range we care about.
    const startDate:DateTime = DateTime.utc().startOf('day');
    const endDate:DateTime = startDate.plus({days: SLOTMAP_FETCH});
    args['startDate'] = startDate;
    args['endDate'] = endDate;

    const url = args.calendar.homesetUrl + args.calendar.provider_id;
    let body = `
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data>
      <C:comp name="VCALENDAR">
        <C:prop name="VERSION"/>
        <C:comp name="VEVENT">
          <C:prop name="SUMMARY"/>
          <C:prop name="DTSTART"/>
          <C:prop name="DTEND"/>
          <C:prop name="DURATION"/>
          <C:prop name="RRULE"/>
          <C:prop name="RDATE"/>
          <C:prop name="EXRULE"/>
          <C:prop name="EXDATE"/>
          <C:prop name="RECURRENCE-ID"/>
        </C:comp>
        <C:comp name="VTIMEZONE"/>
      </C:comp>
    </C:calendar-data>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${startDate.toFormat('yyyyLLddTHHmmss') + 'Z'}"
                      end="${endDate.toFormat('yyyyLLddTHHmmss') + 'Z'}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    header.Depth = 1;
    let response = await fetch(
        url, {
            method: 'report',
            headers: header,
            body: body
        });

    returnObject.data = args.methods.getevents.funcs.parse(await response.text(), {...args, ...iuser});

    return returnObject;
}