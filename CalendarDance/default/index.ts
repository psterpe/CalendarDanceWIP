import * as express from 'express';
import * as cors from 'cors';
import * as session from 'express-session';
import * as firestoreStore from 'firestore-store';
import { Firestore } from '@google-cloud/firestore';
import {CloudTasksClient} from '@google-cloud/tasks';
import * as protos from '@google-cloud/tasks/build/protos/protos';
import { APIResponse, QUEUE_LOCATION, QUEUE_NAME, QUEUE_PROJECT } from './cdconfig';
import { getEnvironment } from './dal';
import { router as userRouter} from './userRouter';
import { router as danceRouter} from './danceRouter';
import * as url from 'url';
import * as fetch from 'node-fetch';
import { cacheSet } from './cache';
import * as os from 'os';

const FirestoreStore = firestoreStore(session);

// In dev with PyCharm, run config env variables are not injected into the environment -- don't know why.
// Just putting the variable in the env seems to work, though.
const RUNNING_LOCALLY:boolean = process.env.NODE_ENV !== 'production';

if (RUNNING_LOCALLY) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'calendardance-1d5f3fa7142b.json';
}

cacheSet('RUNNING_LOCALLY', RUNNING_LOCALLY);
cacheSet('url_frontend', RUNNING_LOCALLY ? 'http://localhost:3000' : 'https://calendardance.appspot.com');

getEnvironment()
    .then((env) => {

        // Put env data into cache for other modules
        Object.keys(env).forEach((k) => {
            cacheSet(k, env[k]);
        });

        let ngrok_default = null;
        let ngrok_worker = null;

        cacheSet('ngrok-default', ngrok_default);
        cacheSet('ngrok-worker', ngrok_worker);

        const local_detour_promise:Promise<any> = new Promise((resolve) => {
            if (RUNNING_LOCALLY) {
                fetch('http://127.0.0.1:4040/api/tunnels')
                    .then(resp => resp.json())
                    .then(json => {
                        for (const tunnel of json.tunnels) {
                            if (tunnel.uri.endsWith('/default')) {
                                ngrok_default = tunnel.public_url.split('//')[1].split('.')[0];
                                cacheSet('ngrok-default', ngrok_default);
                            }
                            else if (tunnel.uri.endsWith('/worker')) {
                                ngrok_worker = tunnel.public_url.split('//')[1].split('.')[0];
                                cacheSet('ngrok-worker', ngrok_worker);
                            }
                        }
                        resolve();
                    })
                    .catch((err) => {
                        console.log('Cannot contact ngrok API; assuming no ngrok');
                        resolve();
                    })
            }
            else {
                resolve();
            }
        })

        local_detour_promise.then(() => {
            const LISTEN_PORT = 5555;
            const API_SECRET = env.API_SECRET;

            const app = express();

            let cors_options = {
                credentials: true,  // Access-Control-Allow-Credentials true in response
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
                    .filter((iface)=>iface.family==='IPv4')[0].address;
                cors_options.origin.push(`http://${local_ip}:3000`);

                cors_options.origin.push('https://psterpe.static.observableusercontent.com');
            }

            app.use(cors(cors_options));

            // Homegrown middleware to determine the URL we're running at
            app.use((req, res, next) => {
                if (!req.app.locals.myurl) {
                    const myurl = ngrok_default ? `http://${ngrok_default}.ngrok.io` :
                        url.format({
                            protocol: RUNNING_LOCALLY ? 'http' : 'https',
                            host: req.get('host'),
                        });
                    req.app.locals.myurl = myurl;

                    cacheSet('url_default', myurl);

                    // Queue task for worker service to tell it our URL
                    const qclient = new CloudTasksClient();
                    const parent = qclient.queuePath(QUEUE_PROJECT, QUEUE_LOCATION, QUEUE_NAME);

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
                    const request = {parent, task};
                    try {
                        qclient.createTask(request)
                            .then((resp) => {
                                console.log('Response from queueing task for worker: ' + resp)
                            });
                    }
                    catch (ex) {
                        console.log('Exception from queueing task for worker ' + ex);
                    }
                }
                next();
            });

            app.use(express.json({type: 'application/json'}));
            app.use(express.urlencoded({extended: true}));

            // Initialize database connection and listen.

            const db = new Firestore();
            cacheSet('db', db);

            // Using Google Cloud Console, I manually created a collection 'dbversion' and
            // put a 'version_data' document in it containing one field, 'version'. Let's test
            // that we can reach the database by retrieving that document.
            const testDocRef = db.collection('dbversion').doc('version_data');
            testDocRef.get()
                .then(doc => {
                    console.log(`CD Listener initializing, dbversion=${doc.data().version}`);

                    // Initialize session middleware (via express-session). Use Firestore
                    // as the backing store for session data; middleware will put session
                    // info in the "sessions" collection.

                    // TODO: Implement something to reap expired sessions from the db

                    app.use(session(
                        {
                            store: new FirestoreStore(
                                {
                                    database: db
                                }
                            ),
                            name: 'CDANCE',
                            secret: API_SECRET,
                            resave: false,
                            saveUninitialized: false,
                            cookie: {
                                httpOnly: false,
                                maxAge: 30 * 60 * 1000 // 30 minutes
                            }
                        }
                    ));

                    cacheSet('initialized', true);

                    // We can access the db, so now it's OK to start listening. Before we listen,
                    // let's set up our routes.
                    app.get('/', async (request, response) => {
                        response.status(200).send(new APIResponse(true, 'default OK'));
                    });

                    app.post('/message', async (request, response) => {
                        if (request.body.message == 'url_worker') {
                            cacheSet('url_worker', request.body.data);
                            response.status(200).send(new APIResponse(true, 'ACK'));
                        }
                        else {
                            response.status(500).send(new APIResponse(false, 'Bad Request'));
                        }
                    });

                    app.use('/user', userRouter);
                    app.use('/dance', danceRouter);

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
