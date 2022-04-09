"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIResponse = exports.isNeedAuthResponse = exports.InsufficientDataError = exports.DANCE_DEFERRAL = exports.REASON_CODES = exports.DANCE_ACTION = exports.DANCE_STATE = exports.AUTH_SCHEME = exports.ALL_PROVIDERS = exports.CALENDAR_PROVIDER = exports.TFACTIVITY = exports.TFTIME = exports.TFNARROWER = exports.TFRANGE = exports.TFSEASON = exports.TFMONTH = exports.TFDAY = exports.TFTOKEN = exports.SPECIAL_USER_SCANNER = exports.QUEUE_NAME = exports.QUEUE_LOCATION = exports.QUEUE_PROJECT = exports.ROLE_SYSADMIN = exports.DANCE_END_OF_LIFE_HRS = exports.DANCE_HALF_LIFE_HRS = exports.FREESTR = exports.FREE = exports.BUSYSTR = exports.BUSY = exports.MILLISECONDS_PER_HOUR = exports.MILLISECONDS_PER_DAY = exports.BITCOUNT_ONEDAY = exports.MINUTES_PER_SLOT = exports.SLOTS_PER_HOUR = exports.SLOTMAP_FETCH = void 0;
exports.SLOTMAP_FETCH = 360;
exports.SLOTS_PER_HOUR = 2;
exports.MINUTES_PER_SLOT = 60 / exports.SLOTS_PER_HOUR;
exports.BITCOUNT_ONEDAY = exports.SLOTS_PER_HOUR * 24;
exports.MILLISECONDS_PER_DAY = 60 * 60 * 24 * 1000;
exports.MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
exports.BUSY = 0;
exports.BUSYSTR = '0';
exports.FREE = 1;
exports.FREESTR = '1';
exports.DANCE_HALF_LIFE_HRS = 24;
exports.DANCE_END_OF_LIFE_HRS = 48;
exports.ROLE_SYSADMIN = 'sysadmin';
exports.QUEUE_PROJECT = 'calendardance';
exports.QUEUE_LOCATION = 'us-east1';
exports.QUEUE_NAME = 'worker-queue';
exports.SPECIAL_USER_SCANNER = 'CD_SCANNER_SERVICE';
var TFTOKEN;
(function (TFTOKEN) {
    TFTOKEN["TODAY"] = "TODAY";
    TFTOKEN["TOMORROW"] = "TOMORROW";
    TFTOKEN["WEEKEND"] = "WEEKEND";
    TFTOKEN["DOW"] = "DOW";
    TFTOKEN["THIS"] = "THIS";
    TFTOKEN["WITHIN"] = "WITHIN";
    TFTOKEN["BEFOREEND"] = "BEFOREEND";
})(TFTOKEN = exports.TFTOKEN || (exports.TFTOKEN = {}));
var TFDAY;
(function (TFDAY) {
    TFDAY[TFDAY["SUN"] = 0] = "SUN";
    TFDAY[TFDAY["MON"] = 1] = "MON";
    TFDAY[TFDAY["TUE"] = 2] = "TUE";
    TFDAY[TFDAY["WED"] = 3] = "WED";
    TFDAY[TFDAY["THU"] = 4] = "THU";
    TFDAY[TFDAY["FRI"] = 5] = "FRI";
    TFDAY[TFDAY["SAT"] = 6] = "SAT";
})(TFDAY = exports.TFDAY || (exports.TFDAY = {}));
var TFMONTH;
(function (TFMONTH) {
    TFMONTH[TFMONTH["JAN"] = 0] = "JAN";
    TFMONTH[TFMONTH["FEB"] = 1] = "FEB";
    TFMONTH[TFMONTH["MAR"] = 2] = "MAR";
    TFMONTH[TFMONTH["APR"] = 3] = "APR";
    TFMONTH[TFMONTH["MAY"] = 4] = "MAY";
    TFMONTH[TFMONTH["JUN"] = 5] = "JUN";
    TFMONTH[TFMONTH["JUL"] = 6] = "JUL";
    TFMONTH[TFMONTH["AUG"] = 7] = "AUG";
    TFMONTH[TFMONTH["SEP"] = 8] = "SEP";
    TFMONTH[TFMONTH["OCT"] = 9] = "OCT";
    TFMONTH[TFMONTH["NOV"] = 10] = "NOV";
    TFMONTH[TFMONTH["DEC"] = 11] = "DEC";
})(TFMONTH = exports.TFMONTH || (exports.TFMONTH = {}));
var TFSEASON;
(function (TFSEASON) {
    TFSEASON["SPRING"] = "SPRING";
    TFSEASON["SUMMER"] = "SUMMER";
    TFSEASON["FALL"] = "FALL";
    TFSEASON["WINTER"] = "WINTER";
})(TFSEASON = exports.TFSEASON || (exports.TFSEASON = {}));
var TFRANGE;
(function (TFRANGE) {
    TFRANGE["ONEWEEK"] = "1W";
    TFRANGE["TWOWEEKS"] = "2W";
    TFRANGE["ONEMONTH"] = "1M";
    TFRANGE["THEMONTH"] = "THEMONTH";
    TFRANGE["THISWEEK"] = "THISWEEK";
    TFRANGE["THISMONTH"] = "THISMONTH";
})(TFRANGE = exports.TFRANGE || (exports.TFRANGE = {}));
var TFNARROWER;
(function (TFNARROWER) {
    TFNARROWER["EARLY"] = "EARLY";
    TFNARROWER["MIDDLE"] = "MIDDLE";
    TFNARROWER["ENDOF"] = "ENDOF";
})(TFNARROWER = exports.TFNARROWER || (exports.TFNARROWER = {}));
var TFTIME;
(function (TFTIME) {
    TFTIME["MORNING"] = "morning";
    TFTIME["MIDDAY"] = "midday";
    TFTIME["AFTERNOON"] = "afternoon";
    TFTIME["AFTERWORK"] = "afterwork";
    TFTIME["ATNIGHT"] = "atnight";
})(TFTIME = exports.TFTIME || (exports.TFTIME = {}));
var TFACTIVITY;
(function (TFACTIVITY) {
    TFACTIVITY["COFFEE"] = "coffee";
    TFACTIVITY["BREAKFAST"] = "breakfast";
    TFACTIVITY["LUNCH"] = "lunch";
    TFACTIVITY["DINNERDRINKS"] = "dinnerdrinks";
    TFACTIVITY["CONVERSATION"] = "conversation";
    TFACTIVITY["MEETING"] = "meeting";
    TFACTIVITY["FUN"] = "fun";
    TFACTIVITY["WHATEVER"] = "whatever";
})(TFACTIVITY = exports.TFACTIVITY || (exports.TFACTIVITY = {}));
var CALENDAR_PROVIDER;
(function (CALENDAR_PROVIDER) {
    CALENDAR_PROVIDER["Google"] = "Google";
    CALENDAR_PROVIDER["Apple"] = "Apple";
    CALENDAR_PROVIDER["Microsoft"] = "Microsoft";
})(CALENDAR_PROVIDER = exports.CALENDAR_PROVIDER || (exports.CALENDAR_PROVIDER = {}));
exports.ALL_PROVIDERS = [
    CALENDAR_PROVIDER.Google,
    CALENDAR_PROVIDER.Apple,
    CALENDAR_PROVIDER.Microsoft
];
var AUTH_SCHEME;
(function (AUTH_SCHEME) {
    AUTH_SCHEME["OAuth2"] = "OAuth2";
    AUTH_SCHEME["Basic"] = "Basic";
})(AUTH_SCHEME = exports.AUTH_SCHEME || (exports.AUTH_SCHEME = {}));
var DANCE_STATE;
(function (DANCE_STATE) {
    DANCE_STATE["INITIATE"] = "INITIATE";
    DANCE_STATE["ACCEPT"] = "ACCEPT";
    DANCE_STATE["QUIT"] = "QUIT";
    DANCE_STATE["NEGOTIATE"] = "NEGOTIATE";
    DANCE_STATE["SNOOZE"] = "SNOOZE";
    DANCE_STATE["CHOOSE"] = "CHOOSE";
    DANCE_STATE["FAIL"] = "FAIL";
    DANCE_STATE["SUCCESS"] = "SUCCESS";
    DANCE_STATE["KILL"] = "KILL";
})(DANCE_STATE = exports.DANCE_STATE || (exports.DANCE_STATE = {}));
var DANCE_ACTION;
(function (DANCE_ACTION) {
    DANCE_ACTION[DANCE_ACTION["ACCEPT"] = 0] = "ACCEPT";
    DANCE_ACTION[DANCE_ACTION["QUIT"] = 1] = "QUIT";
    DANCE_ACTION[DANCE_ACTION["SNOOZE"] = 2] = "SNOOZE";
    DANCE_ACTION[DANCE_ACTION["PROPOSE"] = 3] = "PROPOSE";
    DANCE_ACTION[DANCE_ACTION["CHOOSE"] = 4] = "CHOOSE";
})(DANCE_ACTION = exports.DANCE_ACTION || (exports.DANCE_ACTION = {}));
var REASON_CODES;
(function (REASON_CODES) {
    REASON_CODES[REASON_CODES["REASON_FAIL_NO_COMMON_OPTIONS"] = 0] = "REASON_FAIL_NO_COMMON_OPTIONS";
    REASON_CODES[REASON_CODES["REASON_FAIL_NO_OVERLAPS"] = 1] = "REASON_FAIL_NO_OVERLAPS";
})(REASON_CODES = exports.REASON_CODES || (exports.REASON_CODES = {}));
var DANCE_DEFERRAL;
(function (DANCE_DEFERRAL) {
    DANCE_DEFERRAL["COUPLEDAYS"] = "CoupleDays";
    DANCE_DEFERRAL["AWEEK"] = "AWeek";
    DANCE_DEFERRAL["COUPLEWEEKS"] = "CoupleWeeks";
    DANCE_DEFERRAL["NEXTMONTH"] = "NextMonth";
})(DANCE_DEFERRAL = exports.DANCE_DEFERRAL || (exports.DANCE_DEFERRAL = {}));
class InsufficientDataError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = InsufficientDataError.name;
    }
}
exports.InsufficientDataError = InsufficientDataError;
function isNeedAuthResponse(o) {
    return o.authURL !== undefined;
}
exports.isNeedAuthResponse = isNeedAuthResponse;
class APIResponse {
    constructor(ok, data) {
        this.OK = ok;
        this.data = data;
    }
}
exports.APIResponse = APIResponse;
//# sourceMappingURL=cdconfig.js.map