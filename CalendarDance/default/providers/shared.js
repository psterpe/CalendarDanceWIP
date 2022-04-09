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
const cdconfig_1 = require("../cdconfig");
const auth_1 = require("../auth");
const dal_1 = require("../dal");
const xmldoc = require("xmldoc");
const fetch = require("node-fetch");
const luxon_1 = require("luxon");
function getCalendarListViaAPI(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const headerData = {
            'Authorization': `Bearer ${args.data.accessToken}`
        };
        const response = yield fetch(args.methods.listcalendars.urls.main, {
            method: 'get',
            headers: headerData
        });
        let returnObject = {
            OK: true,
            reason: undefined,
            data: undefined
        };
        const responseData = yield response.json();
        if (responseData.error) {
            returnObject.OK = false;
            returnObject.reason = `Code: ${responseData.error.code}, Reason: ${responseData.error.message}`;
        }
        else {
            returnObject.data = args.methods.listcalendars.funcs.parse(responseData);
        }
        return returnObject;
    });
}
exports.getCalendarListViaAPI = getCalendarListViaAPI;
function getCalendarListViaCalDAV(args) {
    return __awaiter(this, void 0, void 0, function* () {
        let returnObject = {
            OK: true,
            reason: undefined,
            data: undefined
        };
        const pwClear = auth_1.AuthObject.basicPasswordEncryptDecrypt('d', args.userid, args.data.hash, args.data.password);
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
        let url = args.methods.listcalendars.urls.main;
        let response = yield fetch(url, {
            method: 'propfind',
            headers: header,
            body: body
        });
        let doc = new xmldoc.XmlDocument(yield response.text());
        const principalHref = doc.valueWithPath('response.propstat.prop.current-user-principal.href');
        body = `
<propfind xmlns='DAV:' xmlns:cd='urn:ietf:params:xml:ns:caldav'>
  <prop>
    <cd:calendar-home-set/>
  </prop>
</propfind>`;
        url = args.methods.listcalendars.urls.homeset + principalHref;
        response = yield fetch(url, {
            method: 'propfind',
            headers: header,
            body: body
        });
        doc = new xmldoc.XmlDocument(yield response.text());
        const calendarsHref = doc.valueWithPath('response.propstat.prop.calendar-home-set.href');
        body = `
<propfind xmlns='DAV:'>
  <prop>
    <displayname/>
    <resourcetype/>
  </prop>
</propfind>`;
        url = calendarsHref;
        header.Depth = 1;
        response = yield fetch(url, {
            method: 'propfind',
            headers: header,
            body: body
        });
        const rawCalendarList = yield response.text();
        let calendarsHrefOrigin = new URL(calendarsHref).origin;
        returnObject.data = args.methods.listcalendars.funcs.parse(calendarsHrefOrigin, rawCalendarList);
        return returnObject;
    });
}
exports.getCalendarListViaCalDAV = getCalendarListViaCalDAV;
function getCalendarEventsViaAPI(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const headerData = {
            'Authorization': `Bearer ${args.data.accessToken}`
        };
        let iuser = (yield dal_1.getUserByValue({ field: 'id', value: args.userid }));
        const startDate = luxon_1.DateTime.local().setZone(iuser.tz).startOf('day');
        const endDate = startDate.plus({ days: cdconfig_1.SLOTMAP_FETCH });
        let url = args.methods.getevents.urls.main;
        url = url.replace('{startDate}', startDate.toFormat('yyyy-MM-dd'));
        url = url.replace('{endDate}', endDate.toFormat('yyyy-MM-dd'));
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
        let returnObject = {
            OK: true,
            reason: undefined,
            data: []
        };
        for (let i = 0; i < calendar_set.length; i++) {
            let calendar_url = url.replace('{provider_id}', calendar_set[i].provider_id);
            let morePages = true;
            while (morePages) {
                const response = yield fetch(calendar_url, {
                    method: 'get',
                    headers: headerData
                });
                const responseData = yield response.json();
                if (responseData.error) {
                    returnObject.OK = false;
                    returnObject.reason = `Code: ${responseData.error.code}, Reason: ${responseData.error.message}`;
                    return returnObject;
                }
                else {
                    if (args.methods.getevents.nextLink) {
                        calendar_url = responseData[args.methods.getevents.nextLink];
                        if (calendar_url === undefined) {
                            morePages = false;
                        }
                    }
                    else {
                        morePages = false;
                    }
                    returnObject.data = returnObject.data.concat(args.methods.getevents.funcs.parse(responseData, Object.assign(Object.assign({}, args), iuser)));
                }
            }
        }
        return returnObject;
    });
}
exports.getCalendarEventsViaAPI = getCalendarEventsViaAPI;
function getCalendarEventsViaCalDAV(args) {
    return __awaiter(this, void 0, void 0, function* () {
        let returnObject = {
            OK: true,
            reason: undefined,
            data: undefined
        };
        const pwClear = auth_1.AuthObject.basicPasswordEncryptDecrypt('d', args.userid, args.data.hash, args.data.password);
        const credsBase64 = Buffer.from(args.accountid + ':' + pwClear).toString('base64');
        let header = {
            Authorization: 'Basic ' + credsBase64,
            Depth: 0
        };
        let iuser = (yield dal_1.getUserByValue({ field: 'id', value: args.userid }));
        const startDate = luxon_1.DateTime.utc().startOf('day');
        const endDate = startDate.plus({ days: cdconfig_1.SLOTMAP_FETCH });
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
        let response = yield fetch(url, {
            method: 'report',
            headers: header,
            body: body
        });
        returnObject.data = args.methods.getevents.funcs.parse(yield response.text(), Object.assign(Object.assign({}, args), iuser));
        return returnObject;
    });
}
exports.getCalendarEventsViaCalDAV = getCalendarEventsViaCalDAV;
//# sourceMappingURL=shared.js.map