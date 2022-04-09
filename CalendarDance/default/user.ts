import { SlotMap } from './slotmap';
import { getUserByValue, IUser, ISlotMap, IQueryObj} from './dal';
import {ROLE_SYSADMIN, NeedAuthResponse} from './cdconfig';
import {AuthObject, SaltHash} from './auth';
import {Util} from './util';
import * as es6dt from 'es6-dynamic-template';
import { cacheGet } from './cache';

let util = undefined;

export class User {
    userid: string = undefined;  // Will be doc id from database
    email: string;
    handle: string;
    password: string;
    password_hashed: boolean;
    tz: string;
    lname: string;
    fname: string;
    slotmap: SlotMap;
    created: Date = undefined;   // Only set when created in db
    roles: string[];
    activationCode: string = undefined;
    activationExpiration: Date = null;
    passwordResetCode: string = undefined;
    passwordResetExpiration: Date = null;
    activatedDate: Date = null;
    deactivatedDate: Date = null;
    authorizations = {};         // Some of the authorizations data from the db

    constructor(email: string, handle: string, tz: string, lname: string = '', fname: string, password: string, fromdb = false) {
        // Validate params; first name is required, last name is not
        if (!email || !tz || !fname || !password) {
            throw new Error('One or more invalid parameters');
        }
        this.email = email;
        this.handle = handle;

        // If fromdb is true, we're just creating a User object from existing data that was
        // already fetched from the database
        this.password = password;
        this.password_hashed = fromdb;

        this.tz = tz;
        this.lname = lname;
        this.fname = fname;
        this.slotmap = new SlotMap(tz);
        this.roles = ['user'];
    }

    public static fromDb(dbdata: any): User {
        let u: User = new User(dbdata.email, dbdata.handle, dbdata.tz, dbdata.lname, dbdata.fname, dbdata.password, true);
        u.slotmap = SlotMap.fromDb(dbdata.slotmap as ISlotMap);
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

    public toDb(): IUser {
        let thisObject: {} = {...this};
        thisObject['slotmap'] = this.slotmap.toDb();
        return <IUser>thisObject;
    }

    // Update User to reflect successful activation
    public async activate(): Promise<User> {
        this.activatedDate = new Date();
        this.activationCode = '';  // Wipe out the code
        return await this.save();
    }

    public async save(docid?: string): Promise<User> {
        // Are we creating or saving an existing User? Check if we have a userid.
        const creating: boolean = this.userid === undefined;

        const db = await cacheGet('db');
        const userCollectionRef = db.collection('users');
        let existingDoc = undefined;

        const queryRef = userCollectionRef.where('email', '==', this.email);
        const querySnapshot = await queryRef.get();

        if (creating) {
            // If creating, email must be unique across all users; don't save to db if not
            if (!querySnapshot.empty) {
                // Indicates to caller that save did not happen
                return undefined;
            }

            let docRef;

            // If docid was supplied (e.g., for testing), use it, otherwise let db generate
            if (docid) {
                docRef = userCollectionRef.doc(docid);
            } else {
                docRef = userCollectionRef.doc();
            }

            // Set basic data for a new User.
            // Hash the password.
            // Generate an activationCode and associated expiration date 20 minutes from now

            const hashedPassword: string = await User.hashPassword(this.password);
            const codeAndDate = await AuthObject.genActivationCode(this.email, 20);
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

            await docRef.set(userdocData);
            this.userid = docRef.id;
        } else {
            existingDoc = querySnapshot.docs[0].ref;
            const databoundfordb = this.toDb();
            await existingDoc.update(databoundfordb);
        }

        return this;
    }

    private static async getByValue(queryObj: IQueryObj): Promise<User> {
        const data = (await getUserByValue(queryObj));

        // Convert all data we have into a User object
        if (data) {
            return User.fromDb(data);
        }
        else {
            return undefined;
        }
    }

    public static async hashPassword(cleartextPassword: string): Promise<string> {
        const salthash: SaltHash = await AuthObject.hashPassword(cleartextPassword);
        return salthash.salt + '||' + salthash.hash;
    }

    public static async getByEmail(email: string): Promise<User> {
        return User.getByValue({field: 'email', value: email});
    }

    public static async getByActivationCode(code: string): Promise<User> {
        return await User.getByValue({field: 'activationCode', value: code});
    }

    public static async getByPasswordResetCode(code: string): Promise<User> {
        return await User.getByValue({field: 'passwordResetCode', value: code});
    }

    public static async getByUserid(id: string): Promise<User> {
        return await User.getByValue({field: 'id', value: id});
    }

    public static async getAll(): Promise<User[]> {
        const db = await cacheGet('db');
        const snapshot = await db.collection('users').get();
        let users: User[] = [];

        snapshot.forEach((queryDocSnapshot) => {
            const data = {...queryDocSnapshot.data(), id: queryDocSnapshot.id};
            let u: User = User.fromDb(data);
            users.push(u);
        });
        return users;
    }

    public static async isSysadmin(userid: string): Promise<boolean> {
        const u: User = await User.getByUserid(userid);
        return !(u === undefined || u.roles.indexOf(ROLE_SYSADMIN) === -1);
    }


    private static async sendMailMessage(to: string, subject: string, plainBody: string, HTMLbody: string, mergeData: any): Promise<void> {
        if (util === undefined) {
            const mailgun_api_key = await cacheGet('MAILGUN_API_KEY')
            util = new Util(mailgun_api_key);
        }

        const plainBodyMerged: string = es6dt(plainBody, mergeData);
        const HTMLbodyMerged: string = es6dt(HTMLbody, mergeData);

        util.sendmail(to, subject, plainBodyMerged, HTMLbodyMerged);
    }

    public async sendActivationLink(): Promise<void> {
        const url_default = await cacheGet('url_default');
        const activationLink = `${url_default}/user/activate/${this.activationCode}`;
        const mergeData = {fname: this.fname, link: activationLink};

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

        await User.sendMailMessage(this.email, 'Activate your CalendarDance account', mailbodyPlain, mailbodyHTML, mergeData);
    }

    public async sendPasswordResetLink(): Promise<void> {
        const url_frontend = await cacheGet('url_frontend');
        const resetLink = `${url_frontend}/login?t=p&r=4&c=${this.passwordResetCode}`;
        const mergeData = {fname: this.fname, link: resetLink};

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

        await User.sendMailMessage(this.email, 'Reset your CalendarDance password', mailbodyPlain, mailbodyHTML, mergeData);
    }
}