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
const crypto = require("crypto");
const dal_1 = require("./dal");
const cdconfig_1 = require("./cdconfig");
const provider_1 = require("./provider");
const fetch = require("node-fetch");
const url_1 = require("url");
const cache_1 = require("./cache");
class AuthObject {
    constructor(userid, provider, accountid = '') {
        this.provider = provider;
        this.authScheme = provider_1.getScheme(provider);
        this.userid = userid;
        this.accountid = accountid;
        this.docId = undefined;
        this.data = undefined;
    }
    static fromDb(dbdata) {
        let ao = new AuthObject(dbdata.userid, dbdata.provider, dbdata.accountid);
        if (dbdata.docId) {
            ao.docId = dbdata.docId;
        }
        ;
        if (dbdata.data) {
            ao.data = dbdata.data;
        }
        ;
        return ao;
    }
    static getAuth(userid, provider) {
        return __awaiter(this, void 0, void 0, function* () {
            let authObject = new AuthObject(userid, provider);
            const u = (yield dal_1.getUserByValue({ field: 'id', value: userid }));
            const authForProvider = u.authorizations.find(elt => elt.provider === provider);
            if (authForProvider === undefined) {
                return yield authObject.needAuthResponse();
            }
            authObject.docId = authForProvider.docId;
            const authDataDoc = authForProvider;
            authObject.accountid = authForProvider.accountid;
            authObject.data = authForProvider.authData;
            return authObject;
        });
    }
    needAuthResponse() {
        return __awaiter(this, void 0, void 0, function* () {
            let authResponse = {};
            let authRand;
            let stateParam;
            while (true) {
                try {
                    authRand = crypto.randomBytes(16);
                    break;
                }
                catch (ex) {
                    console.log('FYI: randomBytes failed');
                    yield new Promise(r => setTimeout(r, 500));
                }
            }
            const db = yield cache_1.cacheGet('db');
            const userDocRef = db.collection('users').doc(this.userid);
            yield userDocRef.update({ authRand: authRand });
            const stateHash = crypto.createHmac('sha256', authRand);
            stateHash.update(this.userid);
            stateParam = this.userid + '|' + stateHash.digest('hex');
            switch (this.provider) {
                case cdconfig_1.CALENDAR_PROVIDER.Google:
                case cdconfig_1.CALENDAR_PROVIDER.Microsoft:
                    const authurl = yield provider_1.get_OAuth_endpoint(this.provider, 'authorization_endpoint');
                    const scopes = provider_1.ProviderConfigs[this.provider].oauth_scopes;
                    const url_default = yield cache_1.cacheGet('url_default');
                    const CLIENT_IDS = yield cache_1.cacheGet('CLIENT_IDS');
                    authResponse.authURL = authurl + '?' +
                        'scope=' + scopes + '&' +
                        'response_type=code&' +
                        'state=' + stateParam + '&' +
                        'redirect_uri=' + url_default + '/user/oauth/code/' + this.provider + '&' +
                        'client_id=' + CLIENT_IDS[this.provider];
                    if (this.provider == cdconfig_1.CALENDAR_PROVIDER.Google) {
                        authResponse.authURL += '&access_type=offline&prompt=consent';
                    }
                    break;
                case cdconfig_1.CALENDAR_PROVIDER.Apple:
                    authResponse.authURL = '/user/s/basic';
                    authResponse.otherData = {
                        provider: cdconfig_1.CALENDAR_PROVIDER.Apple,
                        stateParam: stateParam
                    };
                    break;
            }
            authResponse.provider = this.provider;
            authResponse.scheme = provider_1.getScheme(this.provider);
            return authResponse;
        });
    }
    storeCreds() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield cache_1.cacheGet('db');
            const authCollectionRef = db.collection(`users/${this.userid}/authorizations`);
            const authQuery = authCollectionRef.where('provider', '==', this.provider);
            const authDocQuerySnapshot = yield authQuery.get();
            let authDataDocRef;
            if (authDocQuerySnapshot.docs.length == 0) {
                authDataDocRef = authCollectionRef.doc();
                yield authDataDocRef.set({
                    authScheme: this.authScheme,
                    provider: this.provider,
                    accountid: this.accountid,
                    authData: {}
                });
            }
            else {
                authDataDocRef = authDocQuerySnapshot.docs[0].ref;
            }
            if (this.authScheme === cdconfig_1.AUTH_SCHEME.OAuth2) {
                this.data = this.data;
                return authDataDocRef.update({
                    'authData.accessToken': this.data.accessToken,
                    'authData.refreshToken': this.data.refreshToken,
                    'authData.tokenGrantedDate': this.data.tokenGrantedDate,
                    'authData.lastRefreshDate': this.data.lastRefreshDate
                });
            }
            else {
                this.data = this.data;
                return authDataDocRef.update({
                    'authData.password': this.data.password,
                    'authData.hash': this.data.hash
                });
            }
        });
    }
    isSufficient() {
        if (!this.data) {
            return false;
        }
        let data;
        switch (this.authScheme) {
            case cdconfig_1.AUTH_SCHEME.OAuth2:
                data = this.data;
                return !(data.accessToken === undefined || data.accessToken === '') &&
                    !(data.refreshToken === undefined || data.refreshToken === '');
            case cdconfig_1.AUTH_SCHEME.Basic:
                data = this.data;
                return !(data.password === undefined ||
                    data.password === '' ||
                    data.hash === undefined ||
                    data.hash === '');
        }
    }
    refreshCreds() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.authScheme != cdconfig_1.AUTH_SCHEME.OAuth2) {
                return false;
            }
            const params = new url_1.URLSearchParams();
            const data = this.data;
            if (data.refreshToken === undefined || data.refreshToken === '') {
                console.log(`refreshCreds has no refreshToken, userid=${this.userid}`);
                return false;
            }
            const CLIENT_IDS = yield cache_1.cacheGet('CLIENT_IDS');
            const CLIENT_SECRETS = yield cache_1.cacheGet('CLIENT_SECRETS');
            params.append('refresh_token', data.refreshToken);
            params.append('client_id', CLIENT_IDS[this.provider]);
            params.append('client_secret', CLIENT_SECRETS[this.provider]);
            params.append('grant_type', 'refresh_token');
            const tokenurl = yield provider_1.get_OAuth_endpoint(this.provider, 'token_endpoint');
            const tokenResponse = yield fetch(tokenurl, {
                method: 'post',
                body: params
            });
            const tokenResponseData = yield tokenResponse.json();
            if (!tokenResponseData.hasOwnProperty('error')) {
                data.accessToken = tokenResponseData.access_token;
                data.lastRefreshDate = new Date();
                data.tokenGrantedDate = data.lastRefreshDate;
                yield this.storeCreds();
                return true;
            }
            else {
                return false;
            }
        });
    }
    callFunc(func, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let functionAttempts = 0;
            let returnObject;
            let need_auth_from_user = !this.isSufficient();
            while (true) {
                if (need_auth_from_user || functionAttempts == 2) {
                    return yield this.needAuthResponse();
                }
                returnObject = yield func.apply(null, [Object.assign({}, args)]);
                functionAttempts += 1;
                if (returnObject.OK) {
                    return returnObject;
                }
                else {
                    need_auth_from_user = !(yield this.refreshCreds());
                }
            }
        });
    }
    static oAuthCode(provider, querystring) {
        return __awaiter(this, void 0, void 0, function* () {
            const stateParam = querystring.state;
            const [userid, givenHash] = stateParam.split('|');
            if (!(yield AuthObject.confirmHash(userid, givenHash))) {
                console.log(`oAuthcode hash mismatch; stateParam=${stateParam}`);
                return;
            }
            const authCode = querystring.code;
            const params = new url_1.URLSearchParams();
            const CLIENT_IDS = yield cache_1.cacheGet('CLIENT_IDS');
            const CLIENT_SECRETS = yield cache_1.cacheGet('CLIENT_SECRETS');
            const url_default = yield cache_1.cacheGet('url_default');
            params.append('code', authCode);
            params.append('client_id', CLIENT_IDS[provider]);
            params.append('client_secret', CLIENT_SECRETS[provider]);
            params.append('redirect_uri', url_default + '/user/oauth/code/' + provider);
            params.append('grant_type', 'authorization_code');
            const tokenurl = yield provider_1.get_OAuth_endpoint(provider, 'token_endpoint');
            const tokenResponse = yield fetch(tokenurl, {
                method: 'post',
                body: params
            });
            const tokenResponseData = yield tokenResponse.json();
            if (tokenResponseData.error) {
                console.log(`oAuthCode error getting tokens: ${tokenResponseData.error_description}`);
                return;
            }
            const authObject = new AuthObject(userid, provider);
            authObject.data = {};
            authObject.data.accessToken = tokenResponseData.access_token;
            authObject.data.refreshToken = tokenResponseData.refresh_token || '';
            authObject.data.tokenGrantedDate = new Date();
            authObject.data.lastRefreshDate = authObject.data.tokenGrantedDate;
            yield authObject.storeCreds();
        });
    }
    static basicAuthPassword(provider, state, accountid, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const [userid, givenHash] = state.split('|');
            if (!AuthObject.confirmHash(userid, givenHash)) {
                console.log(`basicAuthPassword hash mismatch for user ${userid}`);
                return false;
            }
            const authObject = new AuthObject(userid, provider);
            authObject.accountid = accountid;
            authObject.data = {};
            authObject.data.password = yield AuthObject.basicPasswordEncryptDecrypt('e', userid, givenHash, password);
            authObject.data.hash = givenHash;
            yield authObject.storeCreds();
            return true;
        });
    }
    static basicPasswordEncryptDecrypt(action, userid, hexdigest, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let useridBuffer = Buffer.from(userid, 'ascii');
            const hexdigestBuffer = Buffer.from(hexdigest, 'hex');
            let salt = Buffer.alloc(16, 0);
            let saltindex = 0;
            for (const [idx, val] of hexdigestBuffer.entries()) {
                if (idx % 2 === 1) {
                    salt[saltindex++] = val;
                }
                if (saltindex === 16) {
                    break;
                }
            }
            const BASICPW_SECRET = yield cache_1.cacheGet('BASICPW_SECRET');
            const key = crypto.scryptSync(BASICPW_SECRET, salt, 24);
            let iv = Buffer.alloc(16, 0);
            let ivindex = 0;
            while (useridBuffer.length < 16) {
                useridBuffer = Buffer.concat([useridBuffer, useridBuffer]);
            }
            const lh = hexdigestBuffer.length;
            for (const ub of useridBuffer) {
                let i = ub % lh;
                iv[ivindex++] = hexdigestBuffer[i];
                if (ivindex === 16) {
                    break;
                }
            }
            let cryptofunc;
            let fromEncoding, toEncoding;
            if (action === 'e') {
                cryptofunc = crypto.createCipheriv;
                fromEncoding = 'utf8';
                toEncoding = 'hex';
            }
            else {
                cryptofunc = crypto.createDecipheriv;
                fromEncoding = 'hex';
                toEncoding = 'utf8';
            }
            const cipher = cryptofunc('aes-192-cbc', key, iv);
            let processed = cipher.update(payload, fromEncoding, toEncoding);
            processed += cipher.final(toEncoding);
            return processed;
        });
    }
    static confirmHash(userid, hash) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield cache_1.cacheGet('db');
            const userDocRef = db.collection('users').doc(userid);
            const userDocSnapshot = yield userDocRef.get();
            const authRand = userDocSnapshot.get('authRand');
            if (authRand === undefined) {
                console.log(`confirmHash could not find authRand on user ${userid}`);
                return false;
            }
            const calculatedHash = crypto.createHmac('sha256', authRand);
            calculatedHash.update(userid);
            const calculatedHashDigest = calculatedHash.digest('hex');
            return calculatedHashDigest === hash;
        });
    }
    static hashPassword(passwd, salt) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!salt) {
                const saltBuffer = crypto.randomBytes(32);
                salt = saltBuffer.toString('base64');
            }
            const HASH_SECRET = yield cache_1.cacheGet('HASH_SECRET');
            const pwHash = crypto.createHmac('sha256', HASH_SECRET);
            pwHash.update(salt + passwd);
            return {
                salt: salt,
                hash: pwHash.digest('hex')
            };
        });
    }
    static genActivationCode(email, minutes, salt = undefined) {
        return __awaiter(this, void 0, void 0, function* () {
            const ACTIVATION_SECRET = yield cache_1.cacheGet('ACTIVATION_SECRET');
            const activationHash = crypto.createHmac('sha256', ACTIVATION_SECRET);
            const finalSalt = salt ? salt : crypto.randomBytes(24).toString('hex');
            activationHash.update(finalSalt + email);
            const now = new Date();
            const expirationDate = new Date(now.getTime() + minutes * 60 * 1000);
            return {
                code: finalSalt + activationHash.digest('hex'),
                expiration: expirationDate
            };
        });
    }
    static login(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const u = (yield dal_1.getUserByValue({ field: 'email', value: email }));
            if (u === undefined || u.deactivatedDate || !u.activatedDate) {
                return undefined;
            }
            const pwfromdb = u.password.split('||');
            const salthash = yield AuthObject.hashPassword(password, pwfromdb[0]);
            if (pwfromdb[0] === salthash.salt && pwfromdb[1] === salthash.hash) {
                return u;
            }
            else {
                return undefined;
            }
        });
    }
}
exports.AuthObject = AuthObject;
//# sourceMappingURL=auth.js.map