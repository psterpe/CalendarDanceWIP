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
const cors = require("cors");
const session = require("express-session");
const firestoreStore = require("firestore-store");
const firestore_1 = require("@google-cloud/firestore");
const tasks_1 = require("@google-cloud/tasks");
const protos = require("@google-cloud/tasks/build/protos/protos");
const cdconfig_1 = require("./cdconfig");
const dal_1 = require("./dal");
const userRouter_1 = require("./userRouter");
const danceRouter_1 = require("./danceRouter");
const url = require("url");
const fetch = require("node-fetch");
const cache_1 = require("./cache");
const os = require("os");
const FirestoreStore = firestoreStore(session);
const RUNNING_LOCALLY = process.env.NODE_ENV !== 'production';
if (RUNNING_LOCALLY) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'calendardance-1d5f3fa7142b.json';
}
cache_1.cacheSet('RUNNING_LOCALLY', RUNNING_LOCALLY);
cache_1.cacheSet('url_frontend', RUNNING_LOCALLY ? 'http://localhost:3000' : 'https://calendardance.appspot.com');
dal_1.getEnvironment()
    .then((env) => {
    Object.keys(env).forEach((k) => {
        cache_1.cacheSet(k, env[k]);
    });
    let ngrok_default = null;
    let ngrok_worker = null;
    cache_1.cacheSet('ngrok-default', ngrok_default);
    cache_1.cacheSet('ngrok-worker', ngrok_worker);
    const local_detour_promise = new Promise((resolve) => {
        if (RUNNING_LOCALLY) {
            fetch('http://127.0.0.1:4040/api/tunnels')
                .then(resp => resp.json())
                .then(json => {
                for (const tunnel of json.tunnels) {
                    if (tunnel.uri.endsWith('/default')) {
                        ngrok_default = tunnel.public_url.split('//')[1].split('.')[0];
                        cache_1.cacheSet('ngrok-default', ngrok_default);
                    }
                    else if (tunnel.uri.endsWith('/worker')) {
                        ngrok_worker = tunnel.public_url.split('//')[1].split('.')[0];
                        cache_1.cacheSet('ngrok-worker', ngrok_worker);
                    }
                }
                resolve();
            })
                .catch((err) => {
                console.log('Cannot contact ngrok API; assuming no ngrok');
                resolve();
            });
        }
        else {
            resolve();
        }
    });
    local_detour_promise.then(() => {
        const LISTEN_PORT = 5555;
        const API_SECRET = env.API_SECRET;
        const app = express();
        let cors_options = {
            credentials: true,
            origin: [
                'https://calendardanceweb.appspot.com',
                'http://calendardanceweb.appspot.com',
            ]
        };
        if (RUNNING_LOCALLY) {
            cors_options.origin.push('http://localhost:3000');
            cors_options.origin.push('http://127.0.0.1:3000');
            const local_ip = os.networkInterfaces()
                .eth0
                .filter((iface) => iface.family === 'IPv4')[0].address;
            cors_options.origin.push(`http://${local_ip}:3000`);
            cors_options.origin.push('https://psterpe.static.observableusercontent.com');
        }
        app.use(cors(cors_options));
        app.use((req, res, next) => {
            if (!req.app.locals.myurl) {
                const myurl = ngrok_default ? `http://${ngrok_default}.ngrok.io` :
                    url.format({
                        protocol: RUNNING_LOCALLY ? 'http' : 'https',
                        host: req.get('host'),
                    });
                req.app.locals.myurl = myurl;
                cache_1.cacheSet('url_default', myurl);
                const qclient = new tasks_1.CloudTasksClient();
                const parent = qclient.queuePath(cdconfig_1.QUEUE_PROJECT, cdconfig_1.QUEUE_LOCATION, cdconfig_1.QUEUE_NAME);
                const payload = {
                    message: 'url_default',
                    data: myurl
                };
                const task = {
                    appEngineHttpRequest: {
                        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
                        relativeUri: '/worker/message',
                        body: Buffer.from(JSON.stringify(payload)).toString('base64')
                    }
                };
                const request = { parent, task };
                try {
                    qclient.createTask(request)
                        .then((resp) => {
                        console.log('Response from queueing task for worker: ' + resp);
                    });
                }
                catch (ex) {
                    console.log('Exception from queueing task for worker ' + ex);
                }
            }
            next();
        });
        app.use(express.json({ type: 'application/json' }));
        app.use(express.urlencoded({ extended: true }));
        const db = new firestore_1.Firestore();
        cache_1.cacheSet('db', db);
        const testDocRef = db.collection('dbversion').doc('version_data');
        testDocRef.get()
            .then(doc => {
            console.log(`CD Listener initializing, dbversion=${doc.data().version}`);
            app.use(session({
                store: new FirestoreStore({
                    database: db
                }),
                name: 'CDANCE',
                secret: API_SECRET,
                resave: false,
                saveUninitialized: false,
                cookie: {
                    httpOnly: false,
                    maxAge: 30 * 60 * 1000
                }
            }));
            cache_1.cacheSet('initialized', true);
            app.get('/', (request, response) => __awaiter(void 0, void 0, void 0, function* () {
                response.status(200).send(new cdconfig_1.APIResponse(true, 'default OK'));
            }));
            app.post('/message', (request, response) => __awaiter(void 0, void 0, void 0, function* () {
                if (request.body.message == 'url_worker') {
                    cache_1.cacheSet('url_worker', request.body.data);
                    response.status(200).send(new cdconfig_1.APIResponse(true, 'ACK'));
                }
                else {
                    response.status(500).send(new cdconfig_1.APIResponse(false, 'Bad Request'));
                }
            }));
            app.use('/user', userRouter_1.router);
            app.use('/dance', danceRouter_1.router);
            const listenPort = parseInt(process.env.PORT) || LISTEN_PORT;
            app.listen(listenPort, undefined, undefined, (error) => {
                if (error) {
                    console.log(`CD Listener error listening: ${error}`);
                    throw new Error(error.message);
                }
                console.log(`CD Listener listening on ${listenPort}...`);
            });
        })
            .catch(err => {
            console.log(`CD Listener error getting test document from db: ${err}`);
            throw new Error(err.message);
        });
    });
})
    .catch((err) => {
    console.log(err);
});
//# sourceMappingURL=index.js.map