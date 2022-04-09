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
exports.router = void 0;
const express = require("express");
const fetch = require("node-fetch");
const luxon_1 = require("luxon");
const dal_1 = require("./dal");
const cdconfig_1 = require("./cdconfig");
const provider_1 = require("./provider");
const auth_1 = require("./auth");
const slotmap_1 = require("./slotmap");
const user_1 = require("./user");
const calendar_1 = require("./calendar");
const cache_1 = require("./cache");
let frontend;
exports.router = express.Router();
frontend = cache_1.cacheGet('RUNNING_LOCALLY') ? 'http://localhost:3000' : 'https://calendardanceweb.appspot.com';
exports.router.use((req, res, next) => {
    if (!req.get('X-AppEngine-QueueName') && !req.get('x-cloudscheduler')) {
        if ([
            '/',
            '/calendar/listcalendars'
        ].indexOf(req.path) != -1 ||
            req.get('host').endsWith('ngrok.io')) {
            next();
        }
        else {
            console.log(`Non-Google invocation of worker route: ${req.path}`);
            res.status(500).send('Bad request');
            return;
        }
    }
    else {
        next();
    }
});
exports.router.get('/', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const apir = new cdconfig_1.APIResponse(true, 'OK');
    res.status(200).send(apir);
}));
exports.router.post('/calendar/listcalendars', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let payload;
    try {
        payload = JSON.parse(req.body.toString());
        const api_secret = yield cache_1.cacheGet('API_SECRET');
        if (payload.key !== api_secret) {
            console.log(`Key missing or invalid in payload for /listcalendars; key=${payload.key}`);
            res.status(500).send('Bad Request');
            return;
        }
    }
    catch (ex) {
        console.log(`Cannot parse body for payload in /listcalendars; body=${req.body.toString()}`);
        res.status(500).send('Bad Request');
        return;
    }
    const result = yield doWork('listcalendars', payload);
    res.status(200).send(result);
    return;
}));
exports.router.post('/getevents', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let payload;
    try {
        payload = JSON.parse(req.body.toString());
    }
    catch (ex) {
        console.log(`Cannot parse body for payload in /getevents; body=${req.body.toString()}`);
        res.status(500).send('Bad Request');
        return;
    }
    if (payload.ngrok) {
        const ngrok_url = payload.ngrok;
        delete payload.ngrok;
        yield fetch(ngrok_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: Buffer.from(JSON.stringify(payload))
        });
        res.status(200).send();
        return;
    }
    else {
        const auth = yield auth_1.AuthObject.getAuth(payload.userid, payload.provider);
        payload.auth = auth;
        const ical = yield dal_1.getICalendar(payload.userid, payload.provider, payload.calname);
        payload.calendar = ical;
        const result = yield doWork('getevents', payload);
        res.status(result.OK ? 200 : 500).send();
        if (result.OK) {
            const now = luxon_1.DateTime.local();
            let iuser = (yield dal_1.getUserByValue({ field: 'id', value: payload.userid }));
            const smap = slotmap_1.SlotMap.fromDb(iuser.slotmap);
            for (const event of result.data) {
                smap.setBusy(event.startDate, event.endDate);
            }
            smap.lastUpdated = now;
            iuser.slotmap = smap.toDb();
            const user = user_1.User.fromDb(iuser);
            yield user.save();
            ical.lastRefreshed = now.toJSDate();
            const calendar = calendar_1.Calendar.fromDb(Object.assign({}, ical));
            yield calendar.save();
        }
        return;
    }
}));
exports.router.post('/message', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    let payload;
    try {
        payload = JSON.parse(req.body.toString());
    }
    catch (ex) {
        console.log(`Cannot parse body for payload in /message; body=${req.body.toString()}`);
        res.status(500).send('Bad Request');
        return;
    }
    if (payload.message == 'url_default') {
        res.status(200).send();
        cache_1.cacheSet('url_default', payload.data);
        const myurl = yield cache_1.cacheGet('url_worker');
        const resp = yield fetch(payload.data + '/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'url_worker',
                data: myurl
            })
        });
        console.log('worker messaged default, resp=' + resp);
    }
    else {
        console.log('worker service got message it cannot process: ' + JSON.stringify(payload));
        res.status(500).send('Bad Request');
    }
}));
function doWork(operation, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        let auth;
        if (!(payload.auth instanceof auth_1.AuthObject)) {
            auth = auth_1.AuthObject.fromDb(payload.auth);
        }
        else {
            auth = payload.auth;
        }
        if (!auth.userid) {
            auth.userid = payload.userid;
        }
        const provider = payload.provider;
        const providerConfig = provider_1.ProviderConfigs[provider];
        let result;
        const opconfig = providerConfig.methods[operation];
        const func = opconfig.funcs.get;
        result = yield auth.callFunc(func, Object.assign(Object.assign(Object.assign({}, auth), providerConfig), payload));
        if (cdconfig_1.isNeedAuthResponse(result)) {
            result.scheme = auth.authScheme;
            return new cdconfig_1.APIResponse(false, result);
        }
        else {
            return new cdconfig_1.APIResponse(true, result.data);
        }
    });
}
//# sourceMappingURL=workerRouter.js.map