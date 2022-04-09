import * as crypto from 'crypto';
import { getUserByValue, IUser, IAuthorization} from './dal';
import {AUTH_SCHEME, CALENDAR_PROVIDER, NeedAuthResponse, ReturnedResult, ActivationCode} from './cdconfig';
import {get_OAuth_endpoint, getScheme, ProviderConfigs} from './provider';
import * as fetch from 'node-fetch';
import {URLSearchParams} from 'url';
import { cacheGet } from './cache';

export interface OAuth2Data {
    accessToken: string;
    refreshToken: string;
    tokenGrantedDate: Date;
    lastRefreshDate: Date;
}

export interface BasicAuthData {
    password?: string;
    hash: string;
}

export interface SaltHash {
    salt: string;
    hash: string;
}

export class AuthObject {
    provider: CALENDAR_PROVIDER;
    authScheme: AUTH_SCHEME;
    userid: string;
    accountid?: string;   // This is the id or email used with the calendar provider
    docId?: string;
    data?: OAuth2Data | BasicAuthData;

    constructor(userid:string, provider:CALENDAR_PROVIDER, accountid:string='') {
        this.provider = provider;
        this.authScheme = getScheme(provider);
        this.userid = userid;
        this.accountid = accountid;
        this.docId = undefined;
        this.data = undefined;
    }

    public static fromDb(dbdata:IAuthorization):AuthObject {
        let ao:AuthObject = new AuthObject(dbdata.userid, dbdata.provider as CALENDAR_PROVIDER, dbdata.accountid);
        if (dbdata.docId) {ao.docId = dbdata.docId};
        if (dbdata.data) {ao.data = dbdata.data};
        return ao;
    }


    public static async getAuth(userid: string, provider: CALENDAR_PROVIDER): Promise<AuthObject|NeedAuthResponse> {
        let authObject = new AuthObject(userid, provider);

        // Look for authorization specific to the given provider
        const u:IUser = (await getUserByValue({field:'id', value:userid}));
        const authForProvider:IAuthorization = u.authorizations.find(elt => elt.provider === provider);
        if (authForProvider === undefined) {
            return await authObject.needAuthResponse();
        }

        authObject.docId = authForProvider.docId;
        const authDataDoc = authForProvider;
        authObject.accountid = authForProvider.accountid;
        authObject.data = authForProvider.authData;
        return authObject;
    }

    public async needAuthResponse():Promise<NeedAuthResponse> {
        let authResponse:NeedAuthResponse = {};
        let authRand;
        let stateParam;

        // Create a 'state' param for use when requesting authorization. To tie the state
        // param to this user, we generate it as follows:
        //   1. Generate some random bytes
        //   2. Store those random bytes on the user's record
        //   3. Hash the userid
        //   4. Construct the state param as <userid>|<hash>

        // Per documentation, randomBytes can fail if entropy in the system is low.
        // We assume it won't fail for long; just retry in a sleep loop.

        while(true) {
            try {
                authRand = crypto.randomBytes(16);
                break;
            }
            catch(ex) {
                console.log('FYI: randomBytes failed');
                await new Promise(r => setTimeout(r, 500));
            }
        }

        const db = await cacheGet('db');
        const userDocRef = db.collection('users').doc(this.userid);
        await userDocRef.update({authRand: authRand});
        const stateHash = crypto.createHmac('sha256', authRand);
        stateHash.update(this.userid);
        stateParam = this.userid + '|' + stateHash.digest('hex');

        switch(this.provider) {
            case CALENDAR_PROVIDER.Google:
            case CALENDAR_PROVIDER.Microsoft:

                const authurl = await get_OAuth_endpoint(this.provider, 'authorization_endpoint');

                const scopes = ProviderConfigs[this.provider].oauth_scopes;

                const url_default = await cacheGet('url_default');
                const CLIENT_IDS = await cacheGet('CLIENT_IDS');

                authResponse.authURL = authurl + '?' +
                    'scope=' + scopes + '&' +
                    'response_type=code&' +
                    'state=' + stateParam + '&' +
                    'redirect_uri=' + url_default + '/user/oauth/code/' + this.provider + '&' +
                    'client_id=' + CLIENT_IDS[this.provider];
                if (this.provider == CALENDAR_PROVIDER.Google) {
                    authResponse.authURL += '&access_type=offline&prompt=consent';
                }
                break;
            case CALENDAR_PROVIDER.Apple:
                // For Basic auth, there's no oAuth provider from which to get an auth code.
                // Here, we use the authURL to have the caller come back to us with the
                // app-specific password. We provide the stateParam to avoid a userid spoof.
                authResponse.authURL = '/user/s/basic';
                authResponse.otherData = {
                    provider: CALENDAR_PROVIDER.Apple,
                    stateParam: stateParam
                };
                break;
        }
        authResponse.provider = this.provider;
        authResponse.scheme = getScheme(this.provider);
        return authResponse;
    }

    public async storeCreds():Promise<void> {
        const db = await cacheGet('db');
        const authCollectionRef = db.collection(`users/${this.userid}/authorizations`);

        // Query for the authorizations document. If there is no document for
        // the given provider, start one.

        const authQuery = authCollectionRef.where('provider', '==', this.provider);
        const authDocQuerySnapshot = await authQuery.get();

        let authDataDocRef;
        if (authDocQuerySnapshot.docs.length == 0) {
            // Start a doc
            authDataDocRef = authCollectionRef.doc();
            await authDataDocRef.set({
                authScheme: this.authScheme,
                provider: this.provider,
                accountid: this.accountid,
                authData: {}
            });
        }
        else {
            authDataDocRef = authDocQuerySnapshot.docs[0].ref;
        }

        if (this.authScheme === AUTH_SCHEME.OAuth2) {
            this.data = this.data as OAuth2Data;
            return authDataDocRef.update({
                    'authData.accessToken': this.data.accessToken,
                    'authData.refreshToken': this.data.refreshToken,
                    'authData.tokenGrantedDate': this.data.tokenGrantedDate,
                    'authData.lastRefreshDate': this.data.lastRefreshDate
                }
            );
        }
        else {
            this.data = this.data as BasicAuthData;
            return authDataDocRef.update({
                'authData.password': this.data.password,
                'authData.hash': this.data.hash
                }
            );
        }
    }

    public isSufficient():boolean {
        if (!this.data) {
            return false;
        }

        let data:OAuth2Data | BasicAuthData;

        switch (this.authScheme) {
            case AUTH_SCHEME.OAuth2:
                data = <OAuth2Data>this.data;
                return !(data.accessToken === undefined || data.accessToken === '') &&
                       !(data.refreshToken === undefined || data.refreshToken === '');
            case AUTH_SCHEME.Basic:
                data = <BasicAuthData>this.data;
                return !(data.password === undefined ||
                         data.password === '' ||
                         data.hash === undefined ||
                         data.hash === '');
        }
    }

    public async refreshCreds():Promise<boolean> {
        // OAuth2 creds are refreshable, but not so for Basic Auth
        if (this.authScheme != AUTH_SCHEME.OAuth2) {
            return false;
        }

        const params = new URLSearchParams();
        const data = this.data as OAuth2Data;

        if (data.refreshToken===undefined || data.refreshToken === '') {
            console.log(`refreshCreds has no refreshToken, userid=${this.userid}`);
            return false;
        }

        const CLIENT_IDS = await cacheGet('CLIENT_IDS');
        const CLIENT_SECRETS = await cacheGet('CLIENT_SECRETS');

        params.append('refresh_token', data.refreshToken);
        params.append('client_id', CLIENT_IDS[this.provider]);
        params.append('client_secret', CLIENT_SECRETS[this.provider]);
        params.append('grant_type', 'refresh_token');

        // Make the call
        const tokenurl = await get_OAuth_endpoint(this.provider, 'token_endpoint');
        const tokenResponse = await fetch(tokenurl,
            {
                method: 'post',
                body: params
            });

        const tokenResponseData = await tokenResponse.json();
        if (!tokenResponseData.hasOwnProperty('error')) {
            data.accessToken = tokenResponseData.access_token;
            data.lastRefreshDate = new Date();
            data.tokenGrantedDate = data.lastRefreshDate;
            await this.storeCreds();
            return true;
        }
        else {
            return false;
        }
    }

    public async callFunc(func, args:any):Promise<ReturnedResult> {
        let functionAttempts = 0;
        let returnObject;

        let need_auth_from_user:boolean = !this.isSufficient();
        while (true) {
            if (need_auth_from_user || functionAttempts == 2) {
                // Tell caller we don't have valid authorization for this provider
                return await this.needAuthResponse();
            }

            // Call the desired function and see what happens. We pass an array to
            // apply() because it requires one.
            returnObject = await func.apply(null, [{...args}]);
            functionAttempts += 1;

            if (returnObject.OK) {
                return returnObject;
            } else {
                // Our creds didn't work (expired or revoked). Try to refresh them.
                need_auth_from_user = !(await this.refreshCreds());
            }
        }

    }

    public static async oAuthCode(provider, querystring):Promise<void> {
        // The userid comes to us in the 'state' query param, along with a hash that is based on a
        // random value that we saved to the database for the given user. Retrieve that random value
        // and recalc the hash to be sure that this request is legit. If not, this may be a CSRF.
        const stateParam:string = querystring.state;

        // Form of state param is userid|hash.
        const [userid, givenHash] = stateParam.split('|');

        if (!await AuthObject.confirmHash(userid, givenHash)) {
            console.log(`oAuthcode hash mismatch; stateParam=${stateParam}`);
            return;
        }

        // Construct a call to exchange the authorization code for access and refresh tokens
        const authCode = querystring.code;
        const params = new URLSearchParams();

        const CLIENT_IDS = await cacheGet('CLIENT_IDS');
        const CLIENT_SECRETS = await cacheGet('CLIENT_SECRETS');
        const url_default = await cacheGet('url_default');

        params.append('code', authCode);
        params.append('client_id', CLIENT_IDS[provider]);
        params.append('client_secret', CLIENT_SECRETS[provider]);

        params.append('redirect_uri', url_default + '/user/oauth/code/' + provider);
        params.append('grant_type', 'authorization_code');

        // Make the call
        const tokenurl = await get_OAuth_endpoint(provider, 'token_endpoint');
        const tokenResponse = await fetch(tokenurl,
            {
                method: 'post',
                body: params
            });

        // Response is JSON. Parse it, extract the access and refresh tokens, and save them
        const tokenResponseData = await tokenResponse.json();

        // Check for an error. In dev, this only happens when we try to reuse an old auth code,
        // so not expecting an error as long as we properly get a fresh auth code each time.
        if (tokenResponseData.error) {
            console.log(`oAuthCode error getting tokens: ${tokenResponseData.error_description}`);
            return;
        }

        const authObject = new AuthObject(userid, provider);
        authObject.data = {} as OAuth2Data;

        authObject.data.accessToken = tokenResponseData.access_token;
        authObject.data.refreshToken = tokenResponseData.refresh_token || '';
        authObject.data.tokenGrantedDate = new Date();
        authObject.data.lastRefreshDate = authObject.data.tokenGrantedDate;
        await authObject.storeCreds();
}

    public static async basicAuthPassword(provider, state, accountid, password):Promise<boolean> {
        const [userid, givenHash] = state.split('|');

        if (!AuthObject.confirmHash(userid, givenHash)) {
            console.log(`basicAuthPassword hash mismatch for user ${userid}`);
            return false;
        }

        // Store encrypted password along with hash so we can decrypt when we need the password
        const authObject = new AuthObject(userid, provider);
        authObject.accountid = accountid;
        authObject.data = {} as BasicAuthData;

        authObject.data.password = await AuthObject.basicPasswordEncryptDecrypt('e', userid, givenHash, password);
        authObject.data.hash = givenHash;
        await authObject.storeCreds();
        return true;
    }

    public static async basicPasswordEncryptDecrypt(action, userid, hexdigest, payload):Promise<string> {
        let useridBuffer = Buffer.from(userid, 'ascii');
        const hexdigestBuffer = Buffer.from(hexdigest, 'hex');

        // Calc the salt
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

        // Calc the key from the secret and the salt. Must be 192 bits (24 bytes)
        const BASICPW_SECRET = await cacheGet('BASICPW_SECRET');
        const key = crypto.scryptSync(BASICPW_SECRET, salt, 24);

        // Calc the iv (must be 16 bytes for AES cipher)
        let iv = Buffer.alloc(16, 0);
        let ivindex = 0;

        // If useridBuffer is shorter than 16, concat it to itself until it's long enough
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

        // Now encrypt or decrypt
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
    }

    private static async confirmHash(userid, hash):Promise<boolean> {
        const db = await cacheGet('db');
        // Fetch random value from database and use it to recalc hash
        const userDocRef = db.collection('users').doc(userid);
        const userDocSnapshot = await userDocRef.get();
        const authRand = userDocSnapshot.get('authRand');
        if (authRand === undefined) {
            // Very not good.
            console.log(`confirmHash could not find authRand on user ${userid}`)
            return false;
        }

        // Recalc the hash
        const calculatedHash = crypto.createHmac('sha256', authRand);
        calculatedHash.update(userid);
        const calculatedHashDigest = calculatedHash.digest('hex');
        return calculatedHashDigest === hash;
    }

    public static async hashPassword(passwd:string, salt?:string):Promise<SaltHash> {
        // If salt provided, we're checking a password, otherwise, we're hashing a new one
        if (!salt) {
            // Generate long (32 bytes) random salt
            // Prepend salt to password and hash that combo
            const saltBuffer: Buffer = crypto.randomBytes(32);
            salt = saltBuffer.toString('base64');
        }
        const HASH_SECRET = await cacheGet('HASH_SECRET');
        const pwHash = crypto.createHmac('sha256', HASH_SECRET);
        pwHash.update(salt + passwd);
        return {
            salt: salt,
            hash: pwHash.digest('hex')
        };
    }

    // Generate a hex code, e.g., for account activation or password reset
    public static async genActivationCode(email:string, minutes:number, salt:string=undefined):Promise<ActivationCode> {
        const ACTIVATION_SECRET = await cacheGet('ACTIVATION_SECRET');
        const activationHash = crypto.createHmac('sha256', ACTIVATION_SECRET);
        const finalSalt = salt ? salt : crypto.randomBytes(24).toString('hex');
        activationHash.update(finalSalt + email);

        const now:Date = new Date();
        const expirationDate:Date = new Date(now.getTime() + minutes*60*1000);

        return {
            code: finalSalt + activationHash.digest('hex'),
            expiration: expirationDate
        };
    }

    public static async login(email:string, password:string):Promise<IUser> {
        const u:IUser = (await getUserByValue({field:'email', value:email}));
        if (u === undefined || u.deactivatedDate || !u.activatedDate) {
            return undefined;
        }

        const pwfromdb = u.password.split('||');
        const salthash:SaltHash = await AuthObject.hashPassword(password, pwfromdb[0]);
        if (pwfromdb[0] === salthash.salt && pwfromdb[1] === salthash.hash) {
            return u;
        }
        else {
            return undefined;
        }
    }
}