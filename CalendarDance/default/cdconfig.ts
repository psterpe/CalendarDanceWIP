export const SLOTMAP_FETCH = 360;
export const SLOTS_PER_HOUR = 2;
export const MINUTES_PER_SLOT = 60 / SLOTS_PER_HOUR;
export const BITCOUNT_ONEDAY = SLOTS_PER_HOUR * 24;
export const MILLISECONDS_PER_DAY = 60*60*24*1000;
export const MILLISECONDS_PER_HOUR = 60*60*1000;
export const BUSY = 0;
export const BUSYSTR = '0';
export const FREE = 1;
export const FREESTR  = '1';
export const DANCE_HALF_LIFE_HRS = 24
export const DANCE_END_OF_LIFE_HRS = 48

export const ROLE_SYSADMIN = 'sysadmin';

export const QUEUE_PROJECT = 'calendardance';
export const QUEUE_LOCATION = 'us-east1';
export const QUEUE_NAME = 'worker-queue';

export const SPECIAL_USER_SCANNER = 'CD_SCANNER_SERVICE';

import {DateTime} from 'luxon';

export type TFParams = {
    today?: DateTime;
    tz?: string;
    range?: TFRANGE | TFMONTH | TFSEASON | string;
    duration?: number;
    weekendsPreferred?: boolean;
    weekdaysPreferred?: boolean;
    nextflag?: boolean;
    day?: TFDAY;
    narrower?: TFNARROWER;
    time?: TFTIME;
    activity?: TFACTIVITY;
    year?: number;
    stateParams?: any;
}

export enum TFTOKEN {
    TODAY = 'TODAY',
    TOMORROW = 'TOMORROW',
    WEEKEND = 'WEEKEND',
    DOW = 'DOW',
    THIS = 'THIS',
    WITHIN = 'WITHIN',
    BEFOREEND = 'BEFOREEND'
}

export enum TFDAY {
    SUN,
    MON,
    TUE,
    WED,
    THU,
    FRI,
    SAT,
}

export enum TFMONTH {
    JAN,
    FEB,
    MAR,
    APR,
    MAY,
    JUN,
    JUL,
    AUG,
    SEP,
    OCT,
    NOV,
    DEC,
}

export enum TFSEASON {
    SPRING = 'SPRING',
    SUMMER = 'SUMMER',
    FALL = 'FALL',
    WINTER = 'WINTER',
}

export enum TFRANGE {
    ONEWEEK = '1W',
    TWOWEEKS = '2W',
    ONEMONTH = '1M',
    THEMONTH = 'THEMONTH',
    THISWEEK = 'THISWEEK',
    THISMONTH = 'THISMONTH'
}

export enum TFNARROWER {
    EARLY = 'EARLY',
    MIDDLE = 'MIDDLE',
    ENDOF = 'ENDOF'
}

export enum TFTIME {
    MORNING = 'morning',
    MIDDAY = 'midday',
    AFTERNOON = 'afternoon',
    AFTERWORK = 'afterwork',
    ATNIGHT = 'atnight'
}

export enum TFACTIVITY {
    COFFEE = 'coffee',
    BREAKFAST = 'breakfast',
    LUNCH = 'lunch',
    DINNERDRINKS = 'dinnerdrinks',
    CONVERSATION = 'conversation',
    MEETING = 'meeting',
    FUN = 'fun',
    WHATEVER = 'whatever'
}

export enum CALENDAR_PROVIDER {
    Google = 'Google',
    Apple = 'Apple',
    Microsoft = 'Microsoft'
}

export const ALL_PROVIDERS = [
    CALENDAR_PROVIDER.Google,
    CALENDAR_PROVIDER.Apple,
    CALENDAR_PROVIDER.Microsoft
];

export enum AUTH_SCHEME {
    OAuth2 = 'OAuth2',
    Basic = 'Basic'
}

export enum DANCE_STATE {
    INITIATE = 'INITIATE',
    ACCEPT = 'ACCEPT',
    QUIT = 'QUIT',
    NEGOTIATE = 'NEGOTIATE',
    SNOOZE = 'SNOOZE',
    CHOOSE = 'CHOOSE',
    FAIL = 'FAIL',
    SUCCESS = 'SUCCESS',
    KILL = 'KILL'
}

export enum DANCE_ACTION {
    ACCEPT,
    QUIT,
    SNOOZE,
    PROPOSE,
    CHOOSE
}

export enum REASON_CODES {
    REASON_FAIL_NO_COMMON_OPTIONS,
    REASON_FAIL_NO_OVERLAPS
}

export enum DANCE_DEFERRAL {
    COUPLEDAYS ='CoupleDays',
    AWEEK = 'AWeek',
    COUPLEWEEKS = 'CoupleWeeks',
    NEXTMONTH = 'NextMonth'
}

// Borrowed from https://joefallon.net/2018/09/typescript-try-catch-finally-and-custom-errors/
export class InsufficientDataError extends Error {
    constructor(message?:string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = InsufficientDataError.name;            // stack traces display correctly now
    }
}

export interface ReturnedData {
    OK: boolean;
    reason?: string;
    data: any;
}

export interface NeedAuthResponse  {
    authURL?: string;
    originalRoute?: string;
    otherData?: {};
    provider?:string;
    scheme?:string;
}

export type ReturnedResult = ReturnedData | NeedAuthResponse;

export function isNeedAuthResponse(o:ReturnedResult): o is NeedAuthResponse {
    return (o as NeedAuthResponse).authURL !== undefined;
}

export interface CalendarDescriptor {
    name: string;
    id: string;
    email: string;
    primary: boolean;
    homesetUrl?: string;
}

export interface EventDescriptor {
    startDate: DateTime;
    endDate: DateTime;
}

export class APIResponse {
    OK: boolean;
    data: any; // Can hold error message if OK is false

    constructor(ok:boolean, data:any) {
        this.OK = ok;
        // this.data = JSON.stringify(data);
        this.data = data;
    }
}

export interface ActivationCode {
    code: string;
    expiration: Date;
}
