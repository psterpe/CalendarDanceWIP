import {
    TFACTIVITY,
    TFTOKEN,
    TFDAY,
    TFTIME,
    TFNARROWER,
    TFRANGE,
    TFMONTH,
    TFSEASON,
    DANCE_STATE,
    DANCE_ACTION,
    DANCE_DEFERRAL,
    REASON_CODES} from './cdconfig';

let translationTable = {
    en: {
        [TFTOKEN.TODAY]: 'today',
        [TFTOKEN.TOMORROW]: 'tomorrow',
        [TFTOKEN.WEEKEND]: 'this weekend',
        [TFTOKEN.DOW]: 'on',
        [TFTOKEN.THIS]: 'this',
        [TFTOKEN.WITHIN]: 'within',
        [TFTOKEN.BEFOREEND]: 'before the end of',
        'nextflag': 'next',
        'day': 'day',
        ['d'+TFDAY.SUN]: 'Sunday',
        ['d'+TFDAY.MON]: 'Monday',
        ['d'+TFDAY.TUE]: 'Tuesday',
        ['d'+TFDAY.WED]: 'Wednesday',
        ['d'+TFDAY.THU]: 'Thursday',
        ['d'+TFDAY.FRI]: 'Friday',
        ['d'+TFDAY.SAT]: 'Saturday',
        'when': 'when',

        [TFNARROWER.EARLY]: 'early in',
        [TFNARROWER.MIDDLE]: 'middle of',
        [TFNARROWER.ENDOF]: 'end of',

        [TFRANGE.THISWEEK]: 'week',
        [TFRANGE.THISMONTH]: 'month',

        'weekdaysPreferred': 'prefer weekday',
        'weekendsPreferred': 'prefer weekend',

        'ONEWEEK': 'a week',
        'TWOWEEKS': 'two weeks',
        'ONEMONTH': 'a month',
        'THEMONTH': 'the month',

        'month': 'month',
        'season': 'season',

        ['month#'+TFMONTH.JAN]: 'January',
        ['month#'+TFMONTH.FEB]: 'February',
        ['month#'+TFMONTH.MAR]: 'March',
        ['month#'+TFMONTH.APR]: 'April',
        ['month#'+TFMONTH.MAY]: 'May',
        ['month#'+TFMONTH.JUN]: 'June',
        ['month#'+TFMONTH.JUL]: 'July',
        ['month#'+TFMONTH.AUG]: 'August',
        ['month#'+TFMONTH.SEP]: 'September',
        ['month#'+TFMONTH.OCT]: 'October',
        ['month#'+TFMONTH.NOV]: 'November',
        ['month#'+TFMONTH.DEC]: 'December',

        ['season#'+TFSEASON.SPRING]: 'spring',
        ['season#'+TFSEASON.SUMMER]: 'summer',
        ['season#'+TFSEASON.FALL]: 'fall',
        ['season#'+TFSEASON.WINTER]: 'winter',

        'time': 'time of day',
        'plan': 'what\'s the plan?',
        [TFTIME.MORNING]: 'in the morning',
        [TFTIME.MIDDAY]: 'around midday',
        [TFTIME.AFTERNOON]: 'in the afternoon',
        [TFTIME.AFTERWORK]: 'after work',
        [TFTIME.ATNIGHT]: 'in the evening',

        [TFACTIVITY.COFFEE]: 'coffee',
        [TFACTIVITY.BREAKFAST]: 'breakfast',
        [TFACTIVITY.LUNCH]: 'lunch',
        [TFACTIVITY.DINNERDRINKS]: 'dinner & drinks',
        [TFACTIVITY.CONVERSATION]: 'conversation',
        [TFACTIVITY.MEETING]: 'meeting',
        [TFACTIVITY.FUN]: 'fun',
        [TFACTIVITY.WHATEVER]: 'whatever',

        [DANCE_ACTION.QUIT]: 'Quit this dance',
        [DANCE_ACTION.SNOOZE]: 'Snooze this dance',
        [DANCE_ACTION.ACCEPT]: 'Accept the proposed time',
        [DANCE_ACTION.CHOOSE]: 'Choose an option',
        [DANCE_ACTION.PROPOSE]: 'Propose a new time',

        [DANCE_STATE.INITIATE]: {s: 'Sent', r: 'Received'},
        [DANCE_STATE.ACCEPT]: {s: 'Accepted', r: 'Accepted'},
        [DANCE_STATE.QUIT]: {s: 'They have quit', r: 'They have quit'},
        [DANCE_STATE.NEGOTIATE]: {s: 'They have proposed an alternative', r: 'They have proposed an alternative'},
        [DANCE_STATE.SNOOZE]: {s: 'They have snoozed this dance', r: 'They have snoozed this dance'},
        [DANCE_STATE.CHOOSE]: {s: 'Choose an option', r: 'Choose an option'},
        [DANCE_STATE.FAIL]: {s: 'No options are mutually agreeable', r: 'No options are mutually agreeable'},
        [DANCE_STATE.SUCCESS]: {s: 'Success!', r: 'Success!'},
        [DANCE_STATE.KILL]: {s: 'Cancelled by system', r: 'Cancelled by system'},

        [DANCE_DEFERRAL.COUPLEDAYS]: 'a couple of days',
        [DANCE_DEFERRAL.AWEEK]: 'a week',
        [DANCE_DEFERRAL.COUPLEWEEKS]: 'a couple of weeks',
        [DANCE_DEFERRAL.NEXTMONTH]: 'next month',

        [REASON_CODES.REASON_FAIL_NO_COMMON_OPTIONS]: 'You and the other party didn\'t select any options in common'
    }
};

export const _t = (lang, key, transform, ...args) => {
    let t = translationTable[lang][key];
    if (transform === 'tc') {
        return t[0].toUpperCase() + t.slice([1]);
    }
    else if (transform === 'uc') {
        return t.toUpperCase();
    }
    else if (transform === 'sr') {  // sender-receiver
        return t[args[0][0]];
    }
    else {
        return t;
    }
};

export const whenPhrase = (lc, token, params) => {
    const handleWendWday = (p) => {
        if (p.weekdaysOK && !p.weekendsOK) {
            return ' (' + _t(lc, 'weekdaysOK') + ')';
        }
        else if (!p.weekdaysOK && p.weekendsOK) {
            return ' (' + _t(lc, 'weekendsOK') + ')';
        }
        else {
            return '';
        }
    };
    let phrase = '';

    switch (token) {
        case TFTOKEN.TODAY:
        case TFTOKEN.TOMORROW:
        case TFTOKEN.WEEKEND:
            phrase = _t(lc, token, 'tc');
            break;
        case TFTOKEN.DOW:
            phrase = params.nextflag ? 'Next' : 'On';
            phrase += ' ' + _t(lc, 'd'+params.day);
            break;
        case TFTOKEN.THIS:
            if (params.narrower) {
                phrase = _t(lc, params.narrower, 'tc') + ' ';
            }
            phrase += _t(lc, token);
            phrase += ' ' + _t(lc, params.range);
            break;
        case TFTOKEN.WITHIN:
            phrase = _t(lc, token, 'tc');
            phrase += ' ' + _t(lc, params.range);
            break;
        case TFTOKEN.BEFOREEND:
            phrase = _t(lc, token, 'tc');
            phrase += ' ' + _t(lc, params.range);
            break;
        default:
            phrase = 'Error: unknown token';
            break;
    }

    if (params.time) {
        phrase += ` ${_t(lc, params.time)}`;
    }

    // Tack on weekday/weekend preference, when applicable
    phrase += handleWendWday(params);
    return phrase;
};

export const formatTs = (seconds) => {
    const d = new Date(seconds * 1000);
    return d.toLocaleString();
};

