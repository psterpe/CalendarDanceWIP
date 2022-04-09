import * as express from 'express';
import * as fetch from 'node-fetch';
import { CloudTasksClient } from '@google-cloud/tasks';
import * as protos from '@google-cloud/tasks/build/protos/protos';
import { User } from './user';
import { AuthObject } from './auth';
import { getScheme } from './provider';
import {
    CALENDAR_PROVIDER,
    isNeedAuthResponse,
    NeedAuthResponse,
    APIResponse,
    QUEUE_LOCATION, QUEUE_NAME, QUEUE_PROJECT
} from './cdconfig';
import { IUser, ICalendar, getUserByValue} from './dal';
import { Calendar} from './calendar';
import { SlotMap} from './slotmap';
import { cacheGet } from './cache';

let running_locally = false;
cacheGet('RUNNING_LOCALLY')
    .then((v) => {
        running_locally = v;
    });

export const router = express.Router();

// Middleware to insist upon a valid session for certain routes. Protected routes are / [GET]
// and any route starting with /s/ (meaning "s"ession required).
router.use((req, res, next) => {
    if ((req.url === '/' || req.url.startsWith('/s/'))) {
        if (!req.session.userid) {
            res.status(403).send(new APIResponse(false, 'Unauthorized'));
            return;
        }
    }
    next();
});

// Helper function for routes that make an API call directly to the worker service *without*
// queueing a Cloud Task.
async function doWorkerCall(route:string, args:any):Promise<APIResponse> {
    let auth:AuthObject|NeedAuthResponse;
    let apir:APIResponse;

    try {
        auth = await AuthObject.getAuth(args.userid, args.provider as CALENDAR_PROVIDER);
        if (isNeedAuthResponse(auth as NeedAuthResponse)) {
            // Respond with a 200 and use the returned data to indicate
            // that we need authorization for this provider.
            // For OAuth2 providers, send the provider's OAuth location.
            // For Basic Auth providers, send the auth data.

            auth['scheme'] = getScheme(args.provider as CALENDAR_PROVIDER);
            apir = new APIResponse(false, auth);
            return apir;
        }
        auth = auth as AuthObject;
    }
    catch(ex) {
        console.log(`doWorkerCall encountered an error for userid ${args.userid}: ${ex.message}`);
        return new APIResponse(false, 'Bad request');
    }

    const api_secret = await cacheGet('API_SECRET');
    const worker = await cacheGet('url_worker');

    const payload = {
        provider: args.provider,
        auth: auth,
        key: api_secret,
        userid: args.userid
    };


    const response = await fetch(`${worker}/${route}`,
        {
            method: 'POST',
            headers: {'Content-Type': 'application/octet-stream'},
            body: Buffer.from(JSON.stringify(payload))
        });
    const responseJSON = await response.json();

    if (!responseJSON.OK) {
        // Something went wrong
        return new APIResponse(false, responseJSON);
    }

    if (isNeedAuthResponse(responseJSON.data)) {
        apir = new APIResponse(true, responseJSON);
    }
    else {
        apir = new APIResponse(true, responseJSON.data);
    }
    return apir;
}

router.get('/s/all', async (req:express.Request, res:express.Response, next) => {
    // Require a logged-in user who is a sysadmin
    if (! await User.isSysadmin(req.session.userid)) {
        res.status(403).send(new APIResponse(false, 'Unauthorized'));
        return;
    }

    // Security requirement met, so continue...
    const userList:User[] = await User.getAll();
    const apir = new APIResponse(true, userList);
    res.status(200).send(apir);
});

router.post('/', async (req, res, next) => {
    const params = new URLSearchParams();
    const CAPTCHA_SECRET = await cacheGet('CAPTCHA_SECRET');
    params.append('secret', CAPTCHA_SECRET);
    params.append('response', req.body.captchaToken);
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify',
        {
            method: 'POST',
            body: params
        });
    const JSONdata = await response.json();
    if (!JSONdata.success) {
        const mesg = `We believe that you are not a robot, but there was a technical error when we
        tried to verify it. Please try again.`;
        res.status(500).send(new APIResponse(false, mesg));
        return;
    }

    let u:User;

    try {
        u = new User(req.body.email, req.body.handle, req.body.tz, req.body.lname, req.body.fname, req.body.password, false);
    }
    catch(ex) {
        // One or more params undefined or empty strings
        res.status(500).send(new APIResponse(false, ex.message));
        return;
    }

    const savedUser:User = await u.save();
    if (savedUser === undefined) {
        // Email not unique; cannot save user
        res.status(200).send(new APIResponse(false,'Email in use'));
        return;
    }

    await savedUser.sendActivationLink();


    const apir = new APIResponse(true,{userid: savedUser.userid});
    res.status(200).send(apir);
});

router.get('/activate/:code', async (req, res, next) => {
    const frontend = await cacheGet('url_frontend');
    const redirTo = frontend + '/login';

    let gatePromise = Promise.resolve(<any>'');

    const fetchedUser:User  = await User.getByActivationCode(req.params.code);

    let rParam;
    const dt = new Date();

    if (fetchedUser === undefined) {
        rParam = 3;
    }
    else if (fetchedUser.activatedDate) {
        rParam = 2; // Already activated
    }
    else if (dt > fetchedUser.activationExpiration) {
        rParam = 1; // Code has expired
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
    })

});

router.post('/mailcode', async (req, res, next) => {
    // Generate and send either an activation link or a password reset link. This endpoint is to be used when user
    // lost or never received the first activation link, or when they have forgotten their password.
    // To try to cut down on abuse, we only send the link if these criteria are met:
    //   -- provided captchaToken can be validated
    //   -- provided email matches a known user
    //   -- matched user account has not been deactivated (no deactivationDate)
    //   -- for activation link only, matched user account has not been activated (no activationDate)

    // Check the type of link being requested. If unknown, nothing else matters; just bail.
    const validLinktypes = ['activation', 'passwordreset'];
    if (!req.body.linktype || validLinktypes.indexOf(req.body.linktype) === -1) {
        console.log(`/mailcode got invalid linktype: ${req.body.linktype}`);
        res.status(500).send(new APIResponse(false, 'Bad request'));
        return;
    }

    // Now check the captcha
    const params = new URLSearchParams();
    const CAPTCHA_SECRET = await cacheGet('CAPTCHA_SECRET');
    params.append('secret', CAPTCHA_SECRET);
    params.append('response', req.body.captchaToken);
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify',
        {
            method: 'POST',
            body: params
        });
    const JSONdata = await response.json();
    if (!JSONdata.success) {
        console.log(`/mailcode could not verify captcha token: ${req.body.captchaToken}`);
        res.status(500).send(new APIResponse(false, 'Bad request'));
        return;
    }

    // Now check the user-related criteria
    const matchedUser:User = await User.getByEmail(req.body.email);
    if (matchedUser === undefined) {
        console.log(`/mailcode got invalid email: ${req.body.email}`);
        res.status(500).send(new APIResponse(false, 'Bad request'));
        return;
    }

    if (matchedUser.deactivatedDate || (req.body.linktype === 'activation' && matchedUser.activatedDate)) {
        console.log(`/mailcode suspected abuse: ${req.body.email}`);
        res.status(500).send(new APIResponse(false, 'Bad request'));
        return;
    }

    // Generate a fresh link for this user. We use genActivationCode whether for account activation
    // or password reset.
    const newCode = await AuthObject.genActivationCode(req.body.email, 30);
    switch(req.body.linktype) {
        case 'activation':
            matchedUser.activationCode = newCode.code;
            matchedUser.activationExpiration = newCode.expiration;
            break;
        case 'passwordreset':
            matchedUser.passwordResetCode = newCode.code;
            matchedUser.passwordResetExpiration = newCode.expiration;
            break;
        default:
            // Won't get here because we validated linktype earlier
            break;
    }

    matchedUser.save().then(() => {
        // OK, at this point, we can send the link
        switch(req.body.linktype) {
            case 'activation':
                matchedUser.sendActivationLink();
                break;
            case 'passwordreset':
                matchedUser.sendPasswordResetLink();
                break;
            default:
                // Won't get here because we validated linktype earlier
                break;
        }
    });

    res.status(200).send(new APIResponse(true, 'OK'));
});

router.post('/login', async (req, res, next) => {
    const u:IUser = await AuthObject.login(req.body.email, req.body.password);
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

    const apir = new APIResponse(true, responseData);
    res.status(200).send(apir);
});

router.post('/logout', async (req, res, next) => {
    // We currently don't track logins in the database, so just invalidate the session.
    req.session.destroy((err) => {
        if (err) {
            console.log(`Error in /logout destroying session: ${err}`);
        }
    });
    const apir = new APIResponse(true, undefined);
    res.status(200).send(apir);
});

router.post('/session', async (req, res, next) => {
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

    const apir = new APIResponse(validSession, responseData);
    res.status(200).send(apir);
});

router.post('/changepassword', async (req, res, next) => {
    const code = req.body.code;
    const matchedUser:User = await User.getByPasswordResetCode(code);
    if (matchedUser === undefined) {
        console.log(`/changepassword got invalid code: ${req.body.code}`);
        res.status(500).send(new APIResponse(false, 'The password reset code is no longer valid.'));
        return;
    }

    const dt = new Date();
    if (dt > matchedUser.passwordResetExpiration) {
    res.status(500).send(new APIResponse(false, 'The password reset link has expired.'));
    return;
    }

    matchedUser.password = await User.hashPassword(req.body.password);
    await matchedUser.save();

    res.status(200).send(new APIResponse(true, 'OK'));
});

// From our database calendars subcollection, get a list of all calendars we are
// using from all providers.
router.get('/s/calendar', async (req, res, next) => {
    try {
        const calendarsInUse:ICalendar[] = await Calendar.list(req.session.userid);
        res.status(200).send(new APIResponse(true, calendarsInUse));
    }
    catch (ex) {
        console.log(`Exception in userRouter#/calendar[GET]: ${ex.message}`);
        res.status(500).send(new APIResponse(false, ex.message));
    }
});

// Contact the named provider and get a list of calendars the user has with that provider
router.get('/s/calendar/:provider', async (req, res, next) => {
    const provider = req.params.provider;
    const userid = req.session.userid;

    // Validate provider
    if (!CALENDAR_PROVIDER[provider]) {
        console.log(`/calendar GET unknown calendar provider: ${provider}`);
        res.status(500).send(new APIResponse(false,'Bad request'));
        return;
    }

    const apir = await doWorkerCall('calendar/listcalendars', {
        userid: userid,
        provider: provider
    });

    res.status(200).send(apir);
});

// Queue up a worker task to fetch the events from a given calendar
router.get('/s/calendar/:provider/:calname/events', async (req, res, next) => {
    const provider = req.params.provider;
    const userid = req.session.userid;

    // Note that calname can be the special string '-ALL-' which means to fetch events from
    // every calendar we know about for the given provider.
    const calname = req.params.calname;

    // Validate provider
    if (!CALENDAR_PROVIDER[provider]) {
        console.log(`/calendar GET unknown calendar provider: ${provider}`);
        res.status(500).send(new APIResponse(false,'Bad request'));
        return;
    }

    // Queue up a Cloud Task for the worker service
    const qclient = new CloudTasksClient();
    const parent = qclient.queuePath(QUEUE_PROJECT, QUEUE_LOCATION, QUEUE_NAME);

    const payload = {
        userid: userid,
        provider: provider,
        calname: calname
    };

    const ngrok_worker = await cacheGet('ngrok-worker');
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

    const request = {parent, task};
    try {
        const [response] = await qclient.createTask(request);
        res.status(200).send(new APIResponse(true, `Queued task: ${response.name}`));
    }
    catch (ex) {
        res.status(500).send(new APIResponse(false, `Exception queueing task: ${ex.message}`));
    }
});

// Add a calendar to our database calendars subcollection
router.post('/s/calendar', async (req, res, next) => {
    const cal:Calendar = new Calendar(
        req.session.userid,
        req.body.provider,
        req.body.id,
        req.body.name,
        req.body.homesetUrl
    );
    const ok = await cal.save();

    res.status(200).send(new APIResponse(ok, ''));
    return;
});

// Drop a calendar from our database calendars subcollection
router.delete('/s/calendar', async (req, res, next) => {
    const result = await Calendar.drop(req.session.userid, req.body.provider, req.body.name);
    res.status(result ? 200:500).send(new APIResponse(result, ''));
    return;
});

router.get('/oauth/code/:provider', async (req, res, next) => {
    const frontend = running_locally ? 'http://localhost:3000' : 'https://calendardanceweb.appspot.com';
    if (req.query.error == 'access_denied') {
        res.status(200).send(new APIResponse(false, req.query.error_description || 'Access denied'));
        return;
    }
    else {
        await AuthObject.oAuthCode(req.params.provider, req.query);
        res.redirect(302, frontend + '/?auth=OK');
    }
});

router.post('/s/basic', async (req, res, next) => {
    const retval = await AuthObject.basicAuthPassword(req.body.provider, req.body.state, req.body.accountid, req.body.password);
    if (retval) {
        res.status(200).send(new APIResponse(true, 'RETRY'));
    }
    else {
        res.status(500).send(new APIResponse(false, ''));
    }
});

// For debug/devel, get JSON rep (partial) of SlotMap
router.get('/s/slotmap', async (req, res, next) => {
    const iuser:IUser = await getUserByValue({field: 'id', value:req.session.userid});
    const smap:SlotMap = SlotMap.fromDb(iuser.slotmap);
    res.status(200).send(new APIResponse(true, smap.toObject()));
});

router.post('/s/slotmap', async (req, res, next) => {
    const userid = req.session.userid || req.body.userid;
    const iuser:IUser = await getUserByValue({field: 'id', value:userid});
    const smap:SlotMap = SlotMap.fromDb(iuser.slotmap);
    res.status(200).send(new APIResponse(true, smap.toObject()));
});

router.get('/s/slotmapcompare/:usera/:userb', async (req:express.Request, res:express.Response, next) => {
    // Require a logged-in user who is a sysadmin
    if (!await User.isSysadmin(req.session.userid)) {
        res.status(403).send(new APIResponse(false, 'Unauthorized'));
        return;
    }

    if (!req.params.usera || !req.params.userb) {
        res.status(500).send(new APIResponse(false, 'Bad request'));
        return;
    }

    const usera:IUser = await getUserByValue({field: 'id', value:req.params.usera});
    const userb:IUser = await getUserByValue({field: 'id', value:req.params.userb});
    if (!usera || !userb) {
        res.status(500).send(new APIResponse(false, 'Bad request'));
        return;
    }

    const smapa:SlotMap = SlotMap.fromDb(usera.slotmap);
    const smapb:SlotMap = SlotMap.fromDb(userb.slotmap);
    res.status(200).send(new APIResponse(true, {a:smapa.toObject(), b:smapb.toObject()}));
});