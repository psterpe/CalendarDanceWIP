import * as mailgunjs from 'mailgun-js';

const MAILGUN_DOMAIN = 'sandboxcb54b73a4ada4303b0a3a8ff6cd21ff3.mailgun.org';

export class Util {
    mailgun:any;

    constructor(mailgun_api_key) {
        // Initialize to be able to send mail
        this.mailgun = mailgunjs({
            apiKey: mailgun_api_key,
            domain: MAILGUN_DOMAIN
        });
    }

    public sendmail(to:string, subject:string, bodyText:string, bodyHTML:string):void {
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