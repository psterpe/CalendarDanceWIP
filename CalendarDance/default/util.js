"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mailgunjs = require("mailgun-js");
const MAILGUN_DOMAIN = 'sandboxcb54b73a4ada4303b0a3a8ff6cd21ff3.mailgun.org';
class Util {
    constructor(mailgun_api_key) {
        this.mailgun = mailgunjs({
            apiKey: mailgun_api_key,
            domain: MAILGUN_DOMAIN
        });
    }
    sendmail(to, subject, bodyText, bodyHTML) {
        const messagedata = {
            from: 'CalendarDance <me@samples.mailgun.org>',
            to: to,
            subject: subject
        };
        if (bodyText) {
            messagedata['text'] = bodyText;
        }
        if (bodyHTML) {
            messagedata['html'] = bodyHTML;
        }
        this.mailgun.messages().send(messagedata, (error, body) => {
            if (error) {
                console.log(`sendmail error: ${error}`);
            }
        });
    }
}
exports.Util = Util;
//# sourceMappingURL=util.js.map