import * as express from 'express';
const bodyParser = require('body-parser');
import { router as workerRouter} from './workerRouter';
import { APIResponse } from './cdconfig';
import { getEnvironment } from './dal';
import * as url from 'url';
import * as fetch from 'node-fetch';
import { cacheSet } from './cache';
import { Firestore } from '@google-cloud/firestore';

const RUNNING_LOCALLY:boolean = process.env.NODE_ENV !== 'production';
cacheSet('RUNNING_LOCALLY', RUNNING_LOCALLY);

// In dev with PyCharm, run config env variables are not injected into the environment -- don't know why.
// Just putting the variable in the env seems to work, though.
if (RUNNING_LOCALLY) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'calendardance-1d5f3fa7142b.json';
}

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
            const LISTEN_PORT = 5556;

            const app = express();

            app.use(bodyParser.raw({type: 'application/octet-stream'}));

            // Homegrown middleware to determine the URL we're running at
            app.use((req, res, next) => {
                if (!req.app.locals.myurl) {
                    const myurl = ngrok_worker ? `http://${ngrok_worker}.ngrok.io` :
                        url.format({
                        protocol: RUNNING_LOCALLY ? 'http' : 'https',
                        host: req.get('host'),
                    });
                    req.app.locals.myurl = myurl;

                    cacheSet('url_worker', myurl);
                }
                next();
            });

            // Initialize database connection and listen.

            const db = new Firestore();
            cacheSet('db', db);

            // Using Google Cloud Console, I manually created a collection 'dbversion' and
            // put a 'version_data' document in it containing one field, 'version'. Let's test
            // that we can reach the database by retrieving that document.
            const testDocRef = db.collection('dbversion').doc('version_data');
            testDocRef.get()
                .then(doc => {
                    console.log(`CD Worker initializing, dbversion=${doc.data().version}`);

                    cacheSet('initialized', true);

                    // We can access the db, so now it's OK to start listening. Before we listen,
                    // let's set up our routes.
                    app.get('/worker', async (request, response) => {
                        try {
                            response.status(200).send(new APIResponse(true, 'worker OK'));
                        } catch (err) {
                            response.status(500).send(new APIResponse(false, err));
                        }
                    });

                    app.use('/worker', workerRouter);

                    const listenPort = parseInt(process.env.PORT) || LISTEN_PORT;
                    app.listen(listenPort, undefined, undefined, (error) => {
                        if (error) {
                            console.log(`CD Worker error listening: ${error}`);
                            throw new Error(error.message);
                        }
                        console.log(`CD Worker listening on ${listenPort}...`);
                    });
                })
                .catch(err => {
                    console.log(`CD Worker error getting test document from db: ${err}`);
                    throw new Error(err.message);
                });
        });
    })
    .catch((err) => {
        console.log(err);
    });
