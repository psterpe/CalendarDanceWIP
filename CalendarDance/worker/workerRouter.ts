import * as express from 'express';
import * as fetch from 'node-fetch';
import { DateTime } from 'luxon';
import { Timestamp } from '@google-cloud/firestore';
import { getICalendar, getUserByValue, ICalendar, IUser} from './dal';
import {
    APIResponse,
    CALENDAR_PROVIDER,
    DANCE_STATE,
    EventDescriptor,
    isNeedAuthResponse,
    ReturnedResult
} from './cdconfig';
import { ProviderConfigs } from './provider';
import { AuthObject } from './auth';
import { SlotMap } from './slotmap';
import { User } from './user';
import { Calendar } from './calendar';
import { cacheGet, cacheSet } from './cache';

let frontend;
export const router = express.Router();

frontend = cacheGet('RUNNING_LOCALLY') ? 'http://localhost:3000' : 'https://calendardanceweb.appspot.com';

router.use((req, res, next) => {
    // Validate that requests are coming from Google Cloud Tasks (exceptions noted) or
    // Google Cloud Scheduler
    if (!req.get('X-AppEngine-QueueName') && !req.get('x-cloudscheduler')) {
        // Check for exceptions to the rule
        if ([
            '/',
            '/calendar/listcalendars'
        ].indexOf(req.path) != -1 ||
        req.get('host').endsWith('ngrok.io')) {
            next();
        }
        else {
            // OK, not an exception, so reject
            console.log(`Non-Google invocation of worker route: ${req.path}`);
            res.status(500).send('Bad request');
            return;
        }
    }
    else {
        next();
    }
});

router.get('/', async (req:express.Request, res:express.Response, next) => {
    const apir = new APIResponse(true, 'OK');
    res.status(200).send(apir);
});

// This function not meant to be called via Task Queue. When we need
// the user's calendars at a provider, we have to wait for the answer,
// so this func will be called via API and will send back the usual
// APIResponse. Although this function is not a queued task handler,
// it is still sitting behind the same Express middleware as the other functions
// in this module, so it will expect its payload to be a base64 string. It also expects
// to be POSTed to, as a queued task handler would.
router.post('/calendar/listcalendars', async (req, res, next) => {
    let payload;

    try {
        payload = JSON.parse(req.body.toString());
        const api_secret = await cacheGet('API_SECRET');
        if (payload.key !== api_secret) {
            console.log(`Key missing or invalid in payload for /listcalendars; key=${payload.key}`);
            res.status(500).send('Bad Request');
            return;
        }
    }
    catch(ex) {
        console.log(`Cannot parse body for payload in /listcalendars; body=${req.body.toString()}`);
        res.status(500).send('Bad Request');
        return;
    }

    const result:APIResponse = await doWork('listcalendars', payload);
    res.status(200).send(result);
    return;
});

// This route is meant to be invoked via queued Cloud Task. It must return an HTTP status,
// but there is no point in also sending a data payload -- Google's queue will discard that.
// The calendar events retrieved by this route will persist in the form of busy slots in
// the user's SlotMap.

// TODO: Implement a strategy for pruning past SlotMap dates and adjusting the startDate

router.post('/getevents', async (req, res, next) => {

    let payload:any;

    try {
        payload = JSON.parse(req.body.toString());
    }
    catch(ex) {
        console.log(`Cannot parse body for payload in /getevents; body=${req.body.toString()}`);
        res.status(500).send('Bad Request');
        return;
    }

    // If in development, pass control to dev via ngrok
    if (payload.ngrok) {
        const ngrok_url = payload.ngrok;
        delete payload.ngrok;

        await fetch(ngrok_url, {
            method: 'POST',
            headers: {'Content-Type': 'application/octet-stream'},
            body: Buffer.from(JSON.stringify(payload))
        });
        res.status(200).send();
        return;
    }
    else {
        const auth = await AuthObject.getAuth(payload.userid, payload.provider as CALENDAR_PROVIDER);
        payload.auth = auth;

        // Fetch data about the calendar and add that to the payload
        const ical:ICalendar = await getICalendar(payload.userid, payload.provider, payload.calname);
        payload.calendar = ical;

        const result:APIResponse = await doWork('getevents', payload);

        // This route is invoked via queued task, so ACK the queue as soon as we can, and
        // then keep processing.
        res.status(result.OK ? 200 : 500).send();

        if (result.OK) {
            const now = DateTime.local();

            let iuser:IUser = (await getUserByValue({field:'id', value:payload.userid}));
            const smap:SlotMap = SlotMap.fromDb(iuser.slotmap);

            for (const event of result.data) {
                smap.setBusy((<EventDescriptor>event).startDate, (<EventDescriptor>event).endDate);
            }

            smap.lastUpdated = now;
            iuser.slotmap = smap.toDb();

            const user:User = User.fromDb(iuser);
            await user.save()

            ical.lastRefreshed = now.toJSDate() as any as Timestamp;
            const calendar = Calendar.fromDb({...ical});
            await calendar.save();
        }
        return;
    }
});

router.post('/message', async (req, res, next) => {

    let payload:any;

    try {
        payload = JSON.parse(req.body.toString());
    }
    catch(ex) {
        console.log(`Cannot parse body for payload in /message; body=${req.body.toString()}`);
        res.status(500).send('Bad Request');
        return;
    }

    // The message comes from the frontend (the default service), e.g., it is telling use the URL
    // at which we can find it.
    if (payload.message == 'url_default') {
        // ACK the queue
        res.status(200).send();

        cacheSet('url_default', payload.data);
        const myurl = await cacheGet('url_worker');

        // Now that we know how to reach the frontend, tell it *our* URL
        const resp = await fetch(payload.data + '/message', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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

});

async function doWork(operation:string, payload:any):Promise<APIResponse> {
    let auth:AuthObject;
    if (!(payload.auth instanceof AuthObject)) {
        auth = AuthObject.fromDb(payload.auth);
    }
    else {
        auth = payload.auth;
    }

    if (!auth.userid) {
        auth.userid = payload.userid;
    }

    const provider = payload.provider;

    const providerConfig = ProviderConfigs[provider];
    let result:ReturnedResult;

    const opconfig = providerConfig.methods[operation];
    const func = opconfig.funcs.get;

    // Call the appropriate function via callFunc in the auth module; it handles
    // credential refresh if needed.
    result = await auth.callFunc(func,{...auth, ...providerConfig, ...payload});

    if (isNeedAuthResponse(result)) {
        // Not good -- this means we could not refresh OAuth creds, or our basic auth password
        // did not work. User has probably revoked permission.
        result.scheme = auth.authScheme;
        return new APIResponse(false, result);
    }
    else {
        return new APIResponse(true, result.data);
    }
}
