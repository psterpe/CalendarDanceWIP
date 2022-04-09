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
const slotmap_1 = require("./slotmap");
const dal_1 = require("./dal");
const cdconfig_1 = require("./cdconfig");
const auth_1 = require("./auth");
const util_1 = require("./util");
const es6dt = require("es6-dynamic-template");
const cache_1 = require("./cache");
let util = undefined;
class User {
    constructor(email, handle, tz, lname = '', fname, password, fromdb = false) {
        this.userid = undefined;
        this.created = undefined;
        this.activationCode = undefined;
        this.activationExpiration = null;
        this.passwordResetCode = undefined;
        this.passwordResetExpiration = null;
        this.activatedDate = null;
        this.deactivatedDate = null;
        this.authorizations = {};
        if (!email || !tz || !fname || !password) {
            throw new Error('One or more invalid parameters');
        }
        this.email = email;
        this.handle = handle;
        this.password = password;
        this.password_hashed = fromdb;
        this.tz = tz;
        this.lname = lname;
        this.fname = fname;
        this.slotmap = new slotmap_1.SlotMap(tz);
        this.roles = ['user'];
    }
    static fromDb(dbdata) {
        let u = new User(dbdata.email, dbdata.handle, dbdata.tz, dbdata.lname, dbdata.fname, dbdata.password, true);
        u.slotmap = slotmap_1.SlotMap.fromDb(dbdata.slotmap);
        u.created = dbdata.created.toDate();
        u.userid = dbdata.id || dbdata.userid;
        u.activationCode = dbdata.activationCode;
        u.activationExpiration = dbdata.activationExpiration.toDate();
        u.passwordResetCode = dbdata.passwordResetCode || null;
        u.passwordResetExpiration = dbdata.passwordResetExpiration ? dbdata.passwordResetExpiration.toDate() : null;
        u.activatedDate = dbdata.activatedDate ? dbdata.activatedDate.toDate() : null;
        u.deactivatedDate = dbdata.deactivatedDate ? dbdata.deactivatedDate.toDate() : null;
        u.roles = dbdata.roles;
        u.authorizations = dbdata.authorizations;
        return u;
    }
    toDb() {
        let thisObject = Object.assign({}, this);
        thisObject['slotmap'] = this.slotmap.toDb();
        return thisObject;
    }
    activate() {
        return __awaiter(this, void 0, void 0, function* () {
            this.activatedDate = new Date();
            this.activationCode = '';
            return yield this.save();
        });
    }
    save(docid) {
        return __awaiter(this, void 0, void 0, function* () {
            const creating = this.userid === undefined;
            const db = yield cache_1.cacheGet('db');
            const userCollectionRef = db.collection('users');
            let existingDoc = undefined;
            const queryRef = userCollectionRef.where('email', '==', this.email);
            const querySnapshot = yield queryRef.get();
            if (creating) {
                if (!querySnapshot.empty) {
                    return undefined;
                }
                let docRef;
                if (docid) {
                    docRef = userCollectionRef.doc(docid);
                }
                else {
                    docRef = userCollectionRef.doc();
                }
                const hashedPassword = yield User.hashPassword(this.password);
                const codeAndDate = yield auth_1.AuthObject.genActivationCode(this.email, 20);
                this.activationCode = codeAndDate.code;
                this.activationExpiration = codeAndDate.expiration;
                const userdocData = {
                    email: this.email,
                    handle: this.handle,
                    tz: this.tz,
                    lname: this.lname,
                    fname: this.fname,
                    password: hashedPassword,
                    slotmap: this.slotmap.toDb(),
                    created: new Date(),
                    roles: this.roles,
                    activationCode: this.activationCode,
                    activationExpiration: this.activationExpiration,
                    passwordResetCode: null,
                    passwordResetExpiration: null,
                    activatedDate: null,
                    deactivatedDate: null
                };
                yield docRef.set(userdocData);
                this.userid = docRef.id;
            }
            else {
                existingDoc = querySnapshot.docs[0].ref;
                const databoundfordb = this.toDb();
                yield existingDoc.update(databoundfordb);
            }
            return this;
        });
    }
    static getByValue(queryObj) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = (yield dal_1.getUserByValue(queryObj));
            if (data) {
                return User.fromDb(data);
            }
            else {
                return undefined;
            }
        });
    }
    static hashPassword(cleartextPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            const salthash = yield auth_1.AuthObject.hashPassword(cleartextPassword);
            return salthash.salt + '||' + salthash.hash;
        });
    }
    static getByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            return User.getByValue({ field: 'email', value: email });
        });
    }
    static getByActivationCode(code) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield User.getByValue({ field: 'activationCode', value: code });
        });
    }
    static getByPasswordResetCode(code) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield User.getByValue({ field: 'passwordResetCode', value: code });
        });
    }
    static getByUserid(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield User.getByValue({ field: 'id', value: id });
        });
    }
    static getAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield cache_1.cacheGet('db');
            const snapshot = yield db.collection('users').get();
            let users = [];
            snapshot.forEach((queryDocSnapshot) => {
                const data = Object.assign(Object.assign({}, queryDocSnapshot.data()), { id: queryDocSnapshot.id });
                let u = User.fromDb(data);
                users.push(u);
            });
            return users;
        });
    }
    static isSysadmin(userid) {
        return __awaiter(this, void 0, void 0, function* () {
            const u = yield User.getByUserid(userid);
            return !(u === undefined || u.roles.indexOf(cdconfig_1.ROLE_SYSADMIN) === -1);
        });
    }
    static sendMailMessage(to, subject, plainBody, HTMLbody, mergeData) {
        return __awaiter(this, void 0, void 0, function* () {
            if (util === undefined) {
                const mailgun_api_key = yield cache_1.cacheGet('MAILGUN_API_KEY');
                util = new util_1.Util(mailgun_api_key);
            }
            const plainBodyMerged = es6dt(plainBody, mergeData);
            const HTMLbodyMerged = es6dt(HTMLbody, mergeData);
            util.sendmail(to, subject, plainBodyMerged, HTMLbodyMerged);
        });
    }
    sendActivationLink() {
        return __awaiter(this, void 0, void 0, function* () {
            const url_default = yield cache_1.cacheGet('url_default');
            const activationLink = `${url_default}/user/activate/${this.activationCode}`;
            const mergeData = { fname: this.fname, link: activationLink };
            const mailbodyPlain = 'Hello ${fname}: \
    \
    Greetings from CalendarDance. We are sending this email because you just signed up, and \
    we need to verify your email address.\
    \
    Please paste the web address below into your browser to activate your CalendarDance account.\
    \
    ${link}\
    \
    Thanks!';
            const mailbodyHTML = '<html>\
Hello ${fname}:<br/><br/>\
    Greetings from CalendarDance. We are sending this email because you just signed up, and\
    we need to verify your email address.\
    <br/><br/>\
    Please click the link below to activate your CalendarDance account. If you don\'t see a clickable link,\
    you can paste ${link} into your web browser.\
    <br/><br/>\
    <a href="${link}">Click to activate your account</a>\
    <br/><br/>\
    Thanks!\
</html>';
            yield User.sendMailMessage(this.email, 'Activate your CalendarDance account', mailbodyPlain, mailbodyHTML, mergeData);
        });
    }
    sendPasswordResetLink() {
        return __awaiter(this, void 0, void 0, function* () {
            const url_frontend = yield cache_1.cacheGet('url_frontend');
            const resetLink = `${url_frontend}/login?t=p&r=4&c=${this.passwordResetCode}`;
            const mergeData = { fname: this.fname, link: resetLink };
            const mailbodyPlain = 'Hello ${fname}: \
    \
    Greetings from CalendarDance. We are sending this email because you have asked to reset your password.\
    \
    Please paste the web address below into your browser. This will bring you to a page where you can\
    create a new password.\
    \
    ${link}\
    \
    Thanks!';
            const mailbodyHTML = '<html>\
Hello ${fname}:<br/><br/>\
    Greetings from CalendarDance. We are sending this email because you have asked to reset your password.\
    <br/><br/>\
    Please click the link below. This will bring you to a page where you can create a new password. If you don\'t\
    see a clickable link, you can paste <em>${link}</em> into your web browser.\
    <br/><br/>\
    <a href="${link}">Click to reset your password</a>\
    <br/><br/>\
    Thanks!\
</html>';
            yield User.sendMailMessage(this.email, 'Reset your CalendarDance password', mailbodyPlain, mailbodyHTML, mergeData);
        });
    }
}
exports.User = User;
//# sourceMappingURL=user.js.map