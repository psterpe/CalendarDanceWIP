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
const express = require("express");
const fetch = require("node-fetch");
const tasks_1 = require("@google-cloud/tasks");
const protos = require("@google-cloud/tasks/build/protos/protos");
const user_1 = require("./user");
const auth_1 = require("./auth");
const provider_1 = require("./provider");
const cdconfig_1 = require("./cdconfig");
const dal_1 = require("./dal");
const calendar_1 = require("./calendar");
const slotmap_1 = require("./slotmap");
const cache_1 = require("./cache");
let running_locally = false;
cache_1.cacheGet('RUNNING_LOCALLY')
    .then((v) => {
    running_locally = v;
});
exports.router = express.Router();
exports.router.use((req, res, next) => {
    if ((req.url === '/' || req.url.startsWith('/s/'))) {
        if (!req.session.userid) {
            res.status(403).send(new cdconfig_1.APIResponse(false, 'Unauthorized'));
            return;
        }
    }
    next();
});
function doWorkerCall(route, args) {
    return __awaiter(this, void 0, void 0, function* () {
        let auth;
        let apir;
        try {
            auth = yield auth_1.AuthObject.getAuth(args.userid, args.provider);
            if (cdconfig_1.isNeedAuthResponse(auth)) {
                auth['scheme'] = provider_1.getScheme(args.provider);
                apir = new cdconfig_1.APIResponse(false, auth);
                return apir;
            }
            auth = auth;
        }
        catch (ex) {
            console.log(`doWorkerCall encountered an error for userid ${args.userid}: ${ex.message}`);
            return new cdconfig_1.APIResponse(false, 'Bad request');
        }
        const api_secret = yield cache_1.cacheGet('API_SECRET');
        const worker = yield cache_1.cacheGet('url_worker');
        const payload = {
            provider: args.provider,
            auth: auth,
            key: api_secret,
            userid: args.userid
        };
        const response = yield fetch(`${worker}/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: Buffer.from(JSON.stringify(payload))
        });
        const responseJSON = yield response.json();
        if (!responseJSON.OK) {
            return new cdconfig_1.APIResponse(false, responseJSON);
        }
        if (cdconfig_1.isNeedAuthResponse(responseJSON.data)) {
            apir = new cdconfig_1.APIResponse(true, responseJSON);
        }
        else {
            apir = new cdconfig_1.APIResponse(true, responseJSON.data);
        }
        return apir;
    });
}
exports.router.get('/s/all', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(yield user_1.User.isSysadmin(req.session.userid))) {
        res.status(403).send(new cdconfig_1.APIResponse(false, 'Unauthorized'));
        return;
    }
    const userList = yield user_1.User.getAll();
    const apir = new cdconfig_1.APIResponse(true, userList);
    res.status(200).send(apir);
}));
exports.router.post('/', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const params = new URLSearchParams();
    const CAPTCHA_SECRET = yield cache_1.cacheGet('CAPTCHA_SECRET');
    params.append('secret', CAPTCHA_SECRET);
    params.append('response', req.body.captchaToken);
    const response = yield fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: params
    });
    const JSONdata = yield response.json();
    if (!JSONdata.success) {
        const mesg = `We believe that you are not a robot, but there was a technical error when we
        tried to verify it. Please try again.`;
        res.status(500).send(new cdconfig_1.APIResponse(false, mesg));
        return;
    }
    let u;
    try {
        u = new user_1.User(req.body.email, req.body.handle, req.body.tz, req.body.lname, req.body.fname, req.body.password, false);
    }
    catch (ex) {
        res.status(500).send(new cdconfig_1.APIResponse(false, ex.message));
        return;
    }
    const savedUser = yield u.save();
    if (savedUser === undefined) {
        res.status(200).send(new cdconfig_1.APIResponse(false, 'Email in use'));
        return;
    }
    yield savedUser.sendActivationLink();
    const apir = new cdconfig_1.APIResponse(true, { userid: savedUser.userid });
    res.status(200).send(apir);
}));
exports.router.get('/activate/:code', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const frontend = yield cache_1.cacheGet('url_frontend');
    const redirTo = frontend + '/login';
    let gatePromise = Promise.resolve('');
    const fetchedUser = yield user_1.User.getByActivationCode(req.params.code);
    let rParam;
    const dt = new Date();
    if (fetchedUser === undefined) {
        rParam = 3;
    }
    else if (fetchedUser.activatedDate) {
        rParam = 2;
    }
    else if (dt > fetchedUser.activationExpiration) {
        rParam = 1;
    }
    else {
        gatePromise = fetchedUser.activate();
        rParam = 0;
    }
    gatePromise.then(() => {
        const params = [
            `t=a`,
            `r=${rParam}`,
            `e=${encodeURIComponent(fetchedUser.email)}`
        ];
        res.redirect(redirTo + `?` + params.join('&'));
    });
}));
exports.router.post('/mailcode', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const validLinktypes = ['activation', 'passwordreset'];
    if (!req.body.linktype || validLinktypes.indexOf(req.body.linktype) === -1) {
        console.log(`/mailcode got invalid linktype: ${req.body.linktype}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const params = new URLSearchParams();
    const CAPTCHA_SECRET = yield cache_1.cacheGet('CAPTCHA_SECRET');
    params.append('secret', CAPTCHA_SECRET);
    params.append('response', req.body.captchaToken);
    const response = yield fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: params
    });
    const JSONdata = yield response.json();
    if (!JSONdata.success) {
        console.log(`/mailcode could not verify captcha token: ${req.body.captchaToken}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const matchedUser = yield user_1.User.getByEmail(req.body.email);
    if (matchedUser === undefined) {
        console.log(`/mailcode got invalid email: ${req.body.email}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    if (matchedUser.deactivatedDate || (req.body.linktype === 'activation' && matchedUser.activatedDate)) {
        console.log(`/mailcode suspected abuse: ${req.body.email}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const newCode = yield auth_1.AuthObject.genActivationCode(req.body.email, 30);
    switch (req.body.linktype) {
        case 'activation':
            matchedUser.activationCode = newCode.code;
            matchedUser.activationExpiration = newCode.expiration;
            break;
        case 'passwordreset':
            matchedUser.passwordResetCode = newCode.code;
            matchedUser.passwordResetExpiration = newCode.expiration;
            break;
        default:
            break;
    }
    matchedUser.save().then(() => {
        switch (req.body.linktype) {
            case 'activation':
                matchedUser.sendActivationLink();
                break;
            case 'passwordreset':
                matchedUser.sendPasswordResetLink();
                break;
            default:
                break;
        }
    });
    res.status(200).send(new cdconfig_1.APIResponse(true, 'OK'));
}));
exports.router.post('/login', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const u = yield auth_1.AuthObject.login(req.body.email, req.body.password);
    const credentialsValid = u !== undefined;
    let responseData = {
        credentialsValid: credentialsValid
    };
    if (u !== undefined) {
        req['session']['userid'] = u.userid;
        const fname = u.fname;
        const sysadmin = u.roles.indexOf('sysadmin') != -1;
        req['session']['fname'] = fname;
        req['session']['sysadmin'] = sysadmin;
        req['session']['handle'] = u.handle;
        responseData['fname'] = fname;
        responseData['sysadmin'] = sysadmin;
        responseData['userid'] = u.userid;
        responseData['handle'] = u.handle;
    }
    else {
        responseData['sysadmin'] = false;
        responseData['fname'] = '';
    }
    const apir = new cdconfig_1.APIResponse(true, responseData);
    res.status(200).send(apir);
}));
exports.router.post('/logout', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    req.session.destroy((err) => {
        if (err) {
            console.log(`Error in /logout destroying session: ${err}`);
        }
    });
    const apir = new cdconfig_1.APIResponse(true, undefined);
    res.status(200).send(apir);
}));
exports.router.post('/session', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const validSession = req['session']['userid'] !== undefined;
    let responseData = {
        validSession: validSession
    };
    if (validSession) {
        responseData['fname'] = req['session']['fname'];
        responseData['userid'] = req['session']['userid'];
        responseData['handle'] = req['session']['handle'];
        responseData['sysadmin'] = req['session']['sysadmin'];
    }
    const apir = new cdconfig_1.APIResponse(validSession, responseData);
    res.status(200).send(apir);
}));
exports.router.post('/changepassword', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const code = req.body.code;
    const matchedUser = yield user_1.User.getByPasswordResetCode(code);
    if (matchedUser === undefined) {
        console.log(`/changepassword got invalid code: ${req.body.code}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'The password reset code is no longer valid.'));
        return;
    }
    const dt = new Date();
    if (dt > matchedUser.passwordResetExpiration) {
        res.status(500).send(new cdconfig_1.APIResponse(false, 'The password reset link has expired.'));
        return;
    }
    matchedUser.password = yield user_1.User.hashPassword(req.body.password);
    yield matchedUser.save();
    res.status(200).send(new cdconfig_1.APIResponse(true, 'OK'));
}));
exports.router.get('/s/calendar', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calendarsInUse = yield calendar_1.Calendar.list(req.session.userid);
        res.status(200).send(new cdconfig_1.APIResponse(true, calendarsInUse));
    }
    catch (ex) {
        console.log(`Exception in userRouter#/calendar[GET]: ${ex.message}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, ex.message));
    }
}));
exports.router.get('/s/calendar/:provider', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const provider = req.params.provider;
    const userid = req.session.userid;
    if (!cdconfig_1.CALENDAR_PROVIDER[provider]) {
        console.log(`/calendar GET unknown calendar provider: ${provider}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const apir = yield doWorkerCall('calendar/listcalendars', {
        userid: userid,
        provider: provider
    });
    res.status(200).send(apir);
}));
exports.router.get('/s/calendar/:provider/:calname/events', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const provider = req.params.provider;
    const userid = req.session.userid;
    const calname = req.params.calname;
    if (!cdconfig_1.CALENDAR_PROVIDER[provider]) {
        console.log(`/calendar GET unknown calendar provider: ${provider}`);
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const qclient = new tasks_1.CloudTasksClient();
    const parent = qclient.queuePath(cdconfig_1.QUEUE_PROJECT, cdconfig_1.QUEUE_LOCATION, cdconfig_1.QUEUE_NAME);
    const payload = {
        userid: userid,
        provider: provider,
        calname: calname
    };
    const ngrok_worker = yield cache_1.cacheGet('ngrok-worker');
    if (ngrok_worker) {
        const ngrok = `http://${ngrok_worker}.ngrok.io/worker/getevents`;
        payload['ngrok'] = ngrok;
    }
    const task = {
        appEngineHttpRequest: {
            httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
            relativeUri: '/worker/getevents',
            body: Buffer.from(JSON.stringify(payload)).toString('base64')
        }
    };
    const request = { parent, task };
    try {
        const [response] = yield qclient.createTask(request);
        res.status(200).send(new cdconfig_1.APIResponse(true, `Queued task: ${response.name}`));
    }
    catch (ex) {
        res.status(500).send(new cdconfig_1.APIResponse(false, `Exception queueing task: ${ex.message}`));
    }
}));
exports.router.post('/s/calendar', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const cal = new calendar_1.Calendar(req.session.userid, req.body.provider, req.body.id, req.body.name, req.body.homesetUrl);
    const ok = yield cal.save();
    res.status(200).send(new cdconfig_1.APIResponse(ok, ''));
    return;
}));
exports.router.delete('/s/calendar', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield calendar_1.Calendar.drop(req.session.userid, req.body.provider, req.body.name);
    res.status(result ? 200 : 500).send(new cdconfig_1.APIResponse(result, ''));
    return;
}));
exports.router.get('/oauth/code/:provider', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const frontend = running_locally ? 'http://localhost:3000' : 'https://calendardanceweb.appspot.com';
    if (req.query.error == 'access_denied') {
        res.status(200).send(new cdconfig_1.APIResponse(false, req.query.error_description || 'Access denied'));
        return;
    }
    else {
        yield auth_1.AuthObject.oAuthCode(req.params.provider, req.query);
        res.redirect(302, frontend + '/?auth=OK');
    }
}));
exports.router.post('/s/basic', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const retval = yield auth_1.AuthObject.basicAuthPassword(req.body.provider, req.body.state, req.body.accountid, req.body.password);
    if (retval) {
        res.status(200).send(new cdconfig_1.APIResponse(true, 'RETRY'));
    }
    else {
        res.status(500).send(new cdconfig_1.APIResponse(false, ''));
    }
}));
exports.router.get('/s/slotmap', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const iuser = yield dal_1.getUserByValue({ field: 'id', value: req.session.userid });
    const smap = slotmap_1.SlotMap.fromDb(iuser.slotmap);
    res.status(200).send(new cdconfig_1.APIResponse(true, smap.toObject()));
}));
exports.router.post('/s/slotmap', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const userid = req.session.userid || req.body.userid;
    const iuser = yield dal_1.getUserByValue({ field: 'id', value: userid });
    const smap = slotmap_1.SlotMap.fromDb(iuser.slotmap);
    res.status(200).send(new cdconfig_1.APIResponse(true, smap.toObject()));
}));
exports.router.get('/s/slotmapcompare/:usera/:userb', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(yield user_1.User.isSysadmin(req.session.userid))) {
        res.status(403).send(new cdconfig_1.APIResponse(false, 'Unauthorized'));
        return;
    }
    if (!req.params.usera || !req.params.userb) {
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const usera = yield dal_1.getUserByValue({ field: 'id', value: req.params.usera });
    const userb = yield dal_1.getUserByValue({ field: 'id', value: req.params.userb });
    if (!usera || !userb) {
        res.status(500).send(new cdconfig_1.APIResponse(false, 'Bad request'));
        return;
    }
    const smapa = slotmap_1.SlotMap.fromDb(usera.slotmap);
    const smapb = slotmap_1.SlotMap.fromDb(userb.slotmap);
    res.status(200).send(new cdconfig_1.APIResponse(true, { a: smapa.toObject(), b: smapb.toObject() }));
}));
//# sourceMappingURL=userRouter.js.map