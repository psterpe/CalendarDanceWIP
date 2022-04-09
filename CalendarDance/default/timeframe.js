"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bitset_1 = require("bitset");
const cdconfig_1 = require("./cdconfig");
const luxon_1 = require("luxon");
class TimeRange {
    constructor(d, startHour, startMinute, numHours, dbkey) {
        this.startDate = d;
        this.startHour = startHour;
        this.startMinute = startMinute;
        this.numHours = numHours;
        if (dbkey) {
            this.dbkey = dbkey;
        }
    }
    getEndDate() {
        return this.startDate
            .plus({ 'hours': this.startHour, 'minutes': this.startMinute })
            .plus({ hours: this.numHours });
    }
    getHighBit() {
        const startIndex = TimeRange.bitOffset(this.startHour, this.startMinute);
        return startIndex + (this.numHours * cdconfig_1.SLOTS_PER_HOUR) - 1;
    }
    getBitSet() {
        const startIndex = TimeRange.bitOffset(this.startHour, this.startMinute);
        return new bitset_1.BitSet().setRange(startIndex, this.getHighBit(), 1);
    }
    toDb(key) {
        if (this.dbkey === undefined) {
            if (key !== undefined) {
                this.dbkey = key;
            }
            else {
                throw new Error('TimeRange#toDb requires key argument if object has no dbkey.');
            }
        }
        return {
            startDate: this.startDate.toJSDate(),
            startHour: this.startHour,
            startMinute: this.startMinute,
            numHours: this.numHours,
            dbkey: this.dbkey
        };
    }
    static bitOffset(h, m) {
        return cdconfig_1.SLOTS_PER_HOUR * h + Math.trunc(m / cdconfig_1.MINUTES_PER_SLOT);
    }
}
exports.TimeRange = TimeRange;
class TimeFrame {
    constructor(tftoken, tfparams) {
        this.today = TimeFrame.today({});
        try {
            this.timeRanges = this.determineTimeRanges(tftoken, tfparams);
        }
        catch (e) {
            const additionalData = {
                tftoken: tftoken,
                tfparams: JSON.stringify(tfparams)
            };
            console.log(`Exception in TimeFrame constructor (${e.name}), message=${e.message}, params=${JSON.stringify(additionalData)}`);
            throw (e);
        }
    }
    determineTimeRanges(tftoken, tfparams) {
        let startDateFunc = TFTable[tftoken].startDate.func;
        if (!startDateFunc) {
            startDateFunc = tfparams.range == cdconfig_1.TFRANGE.THISWEEK ? TimeFrame.startofThisWeek : TimeFrame.startofThisMonth;
        }
        let startDateArgs = Object.assign(Object.assign({}, TFTable[tftoken].startDate.params), tfparams);
        startDateArgs.today = this.today;
        const startDate = startDateFunc(startDateArgs);
        const spanFunc = TFTable[tftoken].span.func;
        let spanArgs = Object.assign(Object.assign({}, TFTable[tftoken].span.params), tfparams);
        spanArgs.today = this.today;
        const spanHours = spanFunc(spanArgs);
        let tranges = [];
        if (TFTable[tftoken].modifiers) {
            const modifiers = Object.assign(Object.assign({}, TFTable[tftoken].modifiers), tfparams);
            tranges = TimeFrame.applyModifiers(startDate, tftoken, tfparams, spanHours, modifiers);
        }
        else {
            const trange = new TimeRange(startDate, 0, 0, spanHours);
            tranges.push(trange);
        }
        return tranges;
    }
    static stringAnd(s1, s2) {
        let a = Array(s1.length);
        for (let i = 0; i < s1.length; i++) {
            a[i] = (s1[i] === '1' && s2[i] === '1') ? '1' : '0';
        }
        return a.join('');
    }
    static bitmaskForTime(startAndDuration) {
        let dayMask = Array(24 * cdconfig_1.SLOTS_PER_HOUR).fill(cdconfig_1.BUSYSTR);
        const reps = startAndDuration[1] * cdconfig_1.SLOTS_PER_HOUR;
        for (let i = 0; i < reps; i++) {
            dayMask[startAndDuration[0] * cdconfig_1.SLOTS_PER_HOUR + i] = cdconfig_1.FREESTR;
        }
        return dayMask.join('');
    }
    static applyModifiers(startDate, tftoken, tfparams, spanHours, modifiers) {
        let tranges = [];
        const narrower = modifiers.hasOwnProperty('narrower') ? modifiers.narrower : undefined;
        let dropWeekdays = false;
        let dropWeekends = false;
        if (modifiers.hasOwnProperty('weekdaysPreferred')) {
            dropWeekends = modifiers.weekdaysPreferred === true;
        }
        if (modifiers.hasOwnProperty('weekendsPreferred')) {
            dropWeekdays = modifiers.weekendsPreferred === true;
        }
        let includedDayOffsets = [...Array(spanHours / 24).keys()];
        if (narrower) {
            includedDayOffsets = TimeFrame.intersect(includedDayOffsets, TFTable[tftoken].modifierData(tfparams)[narrower].includes);
        }
        for (let i = 0; i < includedDayOffsets.length; i++) {
            if (TimeFrame.isWeekday(startDate, includedDayOffsets[i])) {
                if (dropWeekdays) {
                    includedDayOffsets[i] = -1;
                }
            }
            else if (dropWeekends) {
                includedDayOffsets[i] = -1;
            }
        }
        let tr;
        for (const offset of includedDayOffsets) {
            if (offset !== -1) {
                tr = new TimeRange(startDate.plus({ days: offset }), 0, 0, 24);
                tranges.push(tr);
            }
        }
        for (const trange of tranges) {
            if (tfparams.time || tfparams.activity) {
                let [startHour, startMinute, duration] = TimeTable[tfparams.time || tfparams.activity];
                trange.startHour = Math.max(trange.startHour, startHour);
                trange.startMinute = Math.max(trange.startMinute, startMinute);
                trange.numHours = Math.min(trange.numHours, duration);
            }
        }
        return tranges;
    }
    static whenis(params) {
        let tday = TimeFrame.today(params);
        let thisDay = tday.weekday;
        let desiredDay = params.day;
        let daysDifference = (desiredDay < thisDay) ? 7 + desiredDay - thisDay : desiredDay - thisDay;
        if (params.hasOwnProperty('nextflag')) {
            if (params.nextflag) {
                daysDifference += 7;
            }
        }
        tday.plus({ days: daysDifference });
        return tday;
    }
    static today(params) {
        let t = luxon_1.DateTime.local().startOf('day');
        if (params && params.tz) {
            t = t.setZone(params.tz);
        }
        return t;
    }
    static tomorrow(params) {
        return TimeFrame.today(params).startOf('day').plus({ 'days': 1 });
    }
    static startofThisMonth(params) {
        return TimeFrame.today(params).startOf('month');
    }
    static startofThisWeek(params) {
        return TimeFrame.today(params).startOf('week');
    }
    static daysInMonth(params) {
        if (params.range == cdconfig_1.TFRANGE.THEMONTH || params.range == cdconfig_1.TFRANGE.THISMONTH) {
            return params.today.daysInMonth;
        }
        else {
            const month = params.range + 1;
            const dt = luxon_1.DateTime.local(params.year, month).setZone(params.tz);
            return dt.daysInMonth;
        }
    }
    static daysInRange(params) {
        switch (params.range) {
            case cdconfig_1.TFRANGE.ONEWEEK:
                return 7;
            case cdconfig_1.TFRANGE.TWOWEEKS:
                return 14;
            case cdconfig_1.TFRANGE.ONEMONTH:
                return 30;
            default:
                console.log(`TimeFrame#daysInRange, unknown range value: ${params.range}`);
                return 0;
        }
    }
    static hoursInRange(params) {
        return TimeFrame.daysInRange(params) * 24;
    }
    static daysToEndOf(params) {
        if (params.range == cdconfig_1.TFRANGE.THEMONTH) {
            params.year = params.today.year;
            return TimeFrame.daysInMonth(params) - params.today.day;
        }
        else if (params.range >= cdconfig_1.TFMONTH.JAN && params.range <= cdconfig_1.TFMONTH.DEC) {
            let rangeEnd = TimeFrame.nextOccurrenceOf(params.range + 1, 1).endOf('month');
            return rangeEnd.diff(params.today, 'days').days;
        }
        else if (params.range.startsWith('season#')) {
            const season = params.range.slice(7);
            const seasonEndDates = {
                [cdconfig_1.TFSEASON.SPRING]: { month: 6, date: 20 },
                [cdconfig_1.TFSEASON.SUMMER]: { month: 9, date: 20 },
                [cdconfig_1.TFSEASON.FALL]: { month: 12, date: 20 },
                [cdconfig_1.TFSEASON.WINTER]: { month: 3, date: 20 },
            };
            let rangeEnd = TimeFrame.nextOccurrenceOf(seasonEndDates[season].month, seasonEndDates[season].date);
            return rangeEnd.diff(params.today, 'days').days + 1;
        }
    }
    static nextOccurrenceOf(month, date) {
        const today = TimeFrame.today({});
        const currentDate = today.day;
        const currentYear = today.year;
        const currentMonth = today.month;
        let desiredYear = currentYear;
        if (month < currentMonth || (month == currentMonth && currentDate > date)) {
            desiredYear += 1;
        }
        return luxon_1.DateTime.fromISO(String(desiredYear) + '-' + String(month).padStart(2, '0') + '-' + String(date).padStart(2, '0'));
    }
    static intersect(array1, array2) {
        const b1 = new bitset_1.BitSet(array1);
        const b2 = new bitset_1.BitSet(array2);
        const intersection = b1.and(b2);
        let result = [];
        for (let i = 0; i <= intersection.msb(); i++) {
            if (intersection.get(i) == 1) {
                result.push(i);
            }
        }
        return result;
    }
    static isWeekday(d, offset) {
        const localDay = d.plus({ days: offset }).weekday;
        return localDay >= cdconfig_1.TFDAY.MON && localDay <= cdconfig_1.TFDAY.FRI;
    }
}
exports.TimeFrame = TimeFrame;
TimeFrame.slotStringGen = function* (s) {
    const numdays = s.length / 48;
    let day = 0;
    while (day < numdays) {
        const substring = s.slice(day * 48, day * 48 + 48);
        day += 1;
        yield substring;
    }
};
const TFTable = {
    TODAY: {
        startDate: {
            func: TimeFrame.today,
            params: {}
        },
        span: {
            func: (x) => { return x.duration; },
            params: { duration: 24 }
        },
        modifiers: undefined,
        modifierData: undefined
    },
    TOMORROW: {
        startDate: {
            func: TimeFrame.tomorrow,
            params: {}
        },
        span: {
            func: (x) => { return x.duration; },
            params: { duration: 24 }
        },
        modifiers: undefined,
        modifierData: undefined
    },
    WEEKEND: {
        startDate: {
            func: TimeFrame.whenis,
            params: { day: cdconfig_1.TFDAY.SAT, nextflag: false }
        },
        span: {
            func: (x) => { return x.duration; },
            params: { duration: 48 }
        },
        modifiers: undefined,
        modifierData: undefined
    },
    DOW: {
        startDate: {
            func: TimeFrame.whenis,
            params: { day: undefined, nextflag: false },
        },
        span: {
            func: (x) => { return x.duration; },
            params: { duration: 24 }
        },
        modifiers: undefined,
        modifierData: undefined
    },
    THIS: {
        startDate: {
            func: undefined,
            params: {}
        },
        span: {
            func: (x) => {
                if (x.range == cdconfig_1.TFRANGE.THISWEEK) {
                    return 24 * 7;
                }
                else {
                    x.year = x.today.year;
                    return TimeFrame.daysInMonth(x) * 24;
                }
            },
            params: {}
        },
        modifiers: {
            narrower: undefined, weekendsPreferred: false, weekdaysPreferred: false
        },
        modifierData: (x) => {
            if (x.range == cdconfig_1.TFRANGE.THISWEEK) {
                return {
                    [cdconfig_1.TFNARROWER.EARLY]: { includes: [0, 1] },
                    [cdconfig_1.TFNARROWER.MIDDLE]: { includes: [2, 3] },
                    [cdconfig_1.TFNARROWER.ENDOF]: { includes: [4, 5, 6] },
                };
            }
            else {
                return {
                    [cdconfig_1.TFNARROWER.EARLY]: { includes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
                    [cdconfig_1.TFNARROWER.MIDDLE]: { includes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
                    [cdconfig_1.TFNARROWER.ENDOF]: { includes: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
                };
            }
        }
    },
    WITHIN: {
        startDate: {
            func: TimeFrame.today,
            params: {}
        },
        span: {
            func: TimeFrame.hoursInRange,
            params: { range: undefined }
        },
        modifiers: {
            weekendsPreferred: false, weekdaysPreferred: false
        },
        modifierData: undefined
    },
    BEFOREEND: {
        startDate: {
            func: TimeFrame.today,
            params: {}
        },
        span: {
            func: (x) => { return TimeFrame.daysToEndOf(x) * 24; },
            params: { range: undefined }
        },
        modifiers: {
            weekendsPreferred: false, weekdaysPreferred: false
        },
        modifierData: undefined
    }
};
const TimeTable = {
    [cdconfig_1.TFTIME.MORNING]: [9, 0, 2],
    [cdconfig_1.TFTIME.MIDDAY]: [11, 0, 2],
    [cdconfig_1.TFTIME.AFTERNOON]: [13, 0, 4],
    [cdconfig_1.TFTIME.AFTERWORK]: [17, 0, 2],
    [cdconfig_1.TFTIME.ATNIGHT]: [17, 0, 4],
    [cdconfig_1.TFACTIVITY.BREAKFAST]: [7, 2.5],
    [cdconfig_1.TFACTIVITY.LUNCH]: [11, 30, 2],
    [cdconfig_1.TFACTIVITY.DINNERDRINKS]: [18, 0, 2],
    [cdconfig_1.TFACTIVITY.WHATEVER]: [9, 0, 12]
};
//# sourceMappingURL=timeframe.js.map