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
const bodyParser = require('body-parser');
const workerRouter_1 = require("./workerRouter");
const cdconfig_1 = require("./cdconfig");
const dal_1 = require("./dal");
const url = require("url");
const fetch = require("node-fetch");
const cache_1 = require("./cache");
const firestore_1 = require("@google-cloud/firestore");
const RUNNING_LOCALLY = process.env.NODE_ENV !== 'production';
cache_1.cacheSet('RUNNING_LOCALLY', RUNNING_LOCALLY);
if (RUNNING_LOCALLY) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'calendardance-1d5f3fa7142b.json';
}
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
        const LISTEN_PORT = 5556;
        const app = express();
        app.use(bodyParser.raw({ type: 'application/octet-stream' }));
        app.use((req, res, next) => {
            if (!req.app.locals.myurl) {
                const myurl = ngrok_worker ? `http://${ngrok_worker}.ngrok.io` :
                    url.format({
                        protocol: RUNNING_LOCALLY ? 'http' : 'https',
                        host: req.get('host'),
                    });
                req.app.locals.myurl = myurl;
                cache_1.cacheSet('url_worker', myurl);
            }
            next();
        });
        const db = new firestore_1.Firestore();
        cache_1.cacheSet('db', db);
        const testDocRef = db.collection('dbversion').doc('version_data');
        testDocRef.get()
            .then(doc => {
            console.log(`CD Worker initializing, dbversion=${doc.data().version}`);
            cache_1.cacheSet('initialized', true);
            app.get('/worker', (request, response) => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    response.status(200).send(new cdconfig_1.APIResponse(true, 'worker OK'));
                }
                catch (err) {
                    response.status(500).send(new cdconfig_1.APIResponse(false, err));
                }
            }));
            app.use('/worker', workerRouter_1.router);
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
//# sourceMappingURL=index.js.map