import {BitSet} from 'bitset';
import {
    MINUTES_PER_SLOT,
    SLOTS_PER_HOUR,
    MILLISECONDS_PER_DAY,
    TFParams,
    TFACTIVITY,
    TFDAY,
    TFMONTH,
    TFNARROWER,
    TFRANGE,
    TFSEASON,
    TFTIME,
    TFTOKEN,
    BUSYSTR,
    FREESTR
} from './cdconfig';
import {DateTime} from 'luxon';
import { ITimeRange} from './dal';
import {isNullOrUndefined} from "util";

export class TimeRange {
    dbkey?: number;       // For db storage so we can pinpoint the right TR when we have an array of them
    startDate: DateTime;  // Always midnight on this date
    startHour: number;    // 0-23; hour of day at which TimeRange begins
    startMinute: number;  // 0-59; minute past the hour at which TimeRange begins
    numHours: number;     // Number of hours the TimeRange represents.

    constructor(d: DateTime, startHour:number, startMinute:number, numHours: number, dbkey?:number) {
        this.startDate = d;
        this.startHour = startHour;
        this.startMinute = startMinute;
        this.numHours = numHours;
        if (dbkey) {
            this.dbkey = dbkey;
        }
    }

    public getEndDate():DateTime {
        return this.startDate
            .plus({'hours': this.startHour, 'minutes': this.startMinute})
            .plus({hours: this.numHours});
    }

    public getHighBit():number {
        const startIndex = TimeRange.bitOffset(this.startHour, this.startMinute);
        return startIndex + (this.numHours * SLOTS_PER_HOUR) - 1;
    }

    public getBitSet():BitSet {
        // Create a BitSet whose bit 0 represents midnight on startDate; there should be a 1 in every
        // slot beginning at bitOffset (which is startHour hours and startMinute minutes after startDate)
        // and extending for numHours slots
        const startIndex = TimeRange.bitOffset(this.startHour, this.startMinute);
        return new BitSet().setRange(startIndex, this.getHighBit(), 1);
    }

    public toDb(key?:number):ITimeRange {
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

    private static bitOffset(h:number, m:number): number {
        return SLOTS_PER_HOUR*h + Math.trunc(m / MINUTES_PER_SLOT);
    }
}

export class TimeFrame {
    timeRanges: TimeRange[];
    today: DateTime;

    constructor(tftoken: TFTOKEN,
                tfparams: TFParams) {

        this.today = TimeFrame.today(<TFParams>{});
        try {
            this.timeRanges = this.determineTimeRanges(tftoken, tfparams);
        }
        catch(e) {
            const additionalData = {
                tftoken: tftoken,
                tfparams: JSON.stringify(tfparams)
            };
            console.log(`Exception in TimeFrame constructor (${e.name}), message=${e.message}, params=${JSON.stringify(additionalData)}`);
            throw(e);
        }
    }

    // Create an array of TimeRanges, relative to the given date, that corresponds to the TimeFrame we're operating on.
    // Many TimeFrames will result in a single TimeRange, meaning a contiguous set of slots. For those we'll return an
    // array with one value. Some TimeFrames, however, will result in multiple TimeRanges, meaning two or more
    // discontiguous sets of slots, e.g., a 2-week span that must not include weekends will produce two M-F TimeRanges.
    private determineTimeRanges(tftoken: TFTOKEN, tfparams: TFParams): TimeRange[] {

        // Get startDate of TimeRange by calling the startDate function specified in TFTable
        // Look up TFTable params and merge in any params supplied in the call
        // Also inject our 'today' value so that helper funcs use a consistent notion of 'today'

        let startDateFunc = TFTable[tftoken].startDate.func;
        if (!startDateFunc) {
            startDateFunc = tfparams.range == TFRANGE.THISWEEK ? TimeFrame.startofThisWeek : TimeFrame.startofThisMonth;
        }
        let startDateArgs:TFParams = {...TFTable[tftoken].startDate.params, ...tfparams};
        startDateArgs.today = this.today;
        const startDate:DateTime = startDateFunc(startDateArgs);

        // Do the same thing to determine the span of the TimeRange

        const spanFunc = TFTable[tftoken].span.func;
        let spanArgs:TFParams = {...TFTable[tftoken].span.params, ...tfparams};
        spanArgs.today = this.today;
        const spanHours:number = spanFunc(spanArgs);

        // Now determine the TimeRange(s), applying any modifiers
        let tranges:TimeRange[] = [];

        // If there are modifiers, merge in any relevant tfparams values, and then apply the modifiers
        // This IF-ELSE block can experience an exception, either from applyModifiers or the call to the TimeRange
        // constructor. We will handle those exceptions in the caller of this function.
        if (TFTable[tftoken].modifiers) {
            const modifiers = {...TFTable[tftoken].modifiers, ...tfparams};
            tranges = TimeFrame.applyModifiers(startDate, tftoken, tfparams, spanHours, modifiers);
        }
        else {
            // No modifiers, so create a single TimeRange
            const trange:TimeRange = new TimeRange(startDate, 0, 0, spanHours);
            tranges.push(trange);
        }

        return tranges;
    }

    private static slotStringGen = function*(s:string) {
        const numdays = s.length / 48;
        let day = 0;

        while (day < numdays) {
            const substring = s.slice(day*48, day*48 + 48);
            day += 1;
            yield substring;
        }
    }

    private static stringAnd(s1:string, s2:string):string {
        let a = Array<string>(s1.length);

        for (let i=0; i < s1.length; i++) {
            a[i] = (s1[i]==='1' && s2[i]==='1') ? '1' : '0';
        }
        return a.join('');
    }

    private static bitmaskForTime(startAndDuration:number[]):string {
        let dayMask = Array<string>(24*SLOTS_PER_HOUR).fill(BUSYSTR);
        const reps = startAndDuration[1] * SLOTS_PER_HOUR;
        for (let i=0; i < reps; i++) {
            dayMask[startAndDuration[0]*SLOTS_PER_HOUR + i] = FREESTR;
        }
        return dayMask.join('');
    }

    private static applyModifiers(startDate:DateTime, tftoken:TFTOKEN, tfparams:TFParams, spanHours:number, modifiers:TFParams): TimeRange[] {
        // We'll build and return this array of TimeRanges
        let tranges:TimeRange[] = [];

        const narrower:TFNARROWER = modifiers.hasOwnProperty('narrower') ? modifiers.narrower : undefined;
        let dropWeekdays:boolean = false;
        let dropWeekends:boolean = false;

        if (modifiers.hasOwnProperty('weekdaysPreferred')) {
            dropWeekends = modifiers.weekdaysPreferred === true;
        }
        if (modifiers.hasOwnProperty('weekendsPreferred')) {
            dropWeekdays = modifiers.weekendsPreferred === true;
        }

        let includedDayOffsets:number[] = [...Array(spanHours / 24).keys()];

        // First narrow the span if there is a narrower. The TFTable metadata gives us offsets
        // from the start of the week or month for those days that are included by the given narrower.
        // For example:
        //
        //     includedDayOffsets might be      [0, 1, 2, 3, 4, 5, 6]
        //     modifierData might be            [4, 5, 6]    <-- Representing Fri, Sat, Sun
        //     result will be                   [4, 5, 6]    <-- We keep these days
        if (narrower) {
            includedDayOffsets = TimeFrame.intersect(includedDayOffsets, TFTable[tftoken].modifierData(tfparams)[narrower].includes);
        }

        // Now drop weekdays or weekends, per the modifiers, from the days we are keeping. This might break the
        // span into discontinuous spans. The array elements are day offsets relative to startDate. Weekdays and
        // weekends should be determined in the user's local time. Although it makes no sense for both dropWeekdays
        // and dropWeekends to be true, we'll let the front end handle this. We just honor what we see, so if both
        // are true, we'll end up with no dates.
        for (let i=0; i < includedDayOffsets.length; i++) {
            if (TimeFrame.isWeekday(startDate, includedDayOffsets[i])) {
                if (dropWeekdays) {
                    includedDayOffsets[i] = -1;
                }
            }
            else if (dropWeekends) {
                includedDayOffsets[i] = -1;
            }
        }

        // Now create a TimeRange for every day offset in includedDayOffsets, skipping those that are -1.
        let tr:TimeRange;

        for (const offset of includedDayOffsets) {
            if (offset !== -1) {
                tr = new TimeRange(startDate.plus({days: offset}), 0, 0, 24);
                tranges.push(tr);
            }
        }

        // At this point, every TimeRange starts at midnight on its startDate and represents a day.
        // Now narrow things down even further to account for the tfparams 'time' or 'activity'.
        // (Time supersedes activity; we don't do them both.)
        //
        // TimeTable tells us the hours of the day during which the given tfparams.time or tfparams.activity occurs.

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

    public static whenis(params: TFParams):DateTime {
        // Given a day of the week, returns the date (at midnight) of the next time that day occurs
        // relative to today.
        //
        // Examples assuming today is Tuesday (day=2):
        //
        // whenis(TFDAY.TUE) --> Today. To get "next Tuesday" (a week from today), the nextFlag would have to be set.
        //
        // whenis(TFDAY.THU) --> Two days from now.
        //
        // whenis(TFDAY.SUN) --> Five days from now.
        //
        // If nextFlag is true, get the day from next week.

        let tday:DateTime = TimeFrame.today(params);
        let thisDay:number = tday.weekday;
        let desiredDay:number = params.day;
        let daysDifference = (desiredDay < thisDay) ? 7 + desiredDay - thisDay : desiredDay - thisDay;

        // Add a week if nextflag is set
        if (params.hasOwnProperty('nextflag')) {
            if (params.nextflag) {
                daysDifference += 7;
            }
        }

        // Produce the date that is daysDifference from today
        tday.plus({days: daysDifference});
        return tday;
    }

    public static today(params: TFParams): DateTime {
        let t:DateTime = DateTime.local().startOf('day');
        if (params && params.tz) {
            t = t.setZone(params.tz);
        }
        return t;
    }

    public static tomorrow(params: TFParams): DateTime {
        return TimeFrame.today(params).startOf('day').plus({'days': 1});
    }

    public static startofThisMonth(params: TFParams): DateTime {
        return TimeFrame.today(params).startOf('month');
    }

    public static startofThisWeek(params: TFParams): DateTime {
        return TimeFrame.today(params).startOf('week');
    }

    public static daysInMonth(params: TFParams): number {
        if (params.range == TFRANGE.THEMONTH || params.range == TFRANGE.THISMONTH) {
            return params.today.daysInMonth;
        }
        else {
            // Assume range is a TFMONTH value. We are 0-based; luxon is 1-based, so add 1.
            const month = <number>params.range + 1;
            const dt = DateTime.local(params.year, month).setZone(params.tz);
            return dt.daysInMonth;
        }
    }

    public static daysInRange(params: TFParams): number {
        switch(params.range) {
            case TFRANGE.ONEWEEK:
                return 7;
            case TFRANGE.TWOWEEKS:
                return 14;
            case TFRANGE.ONEMONTH:
                return 30; // We approximate
            default:
                // Not good, but unlikely, so let's log it and return something
                console.log(`TimeFrame#daysInRange, unknown range value: ${params.range}`);
                return 0;
        }
    }

    public static hoursInRange(params: TFParams): number {
        return TimeFrame.daysInRange(params) * 24;
    }

    public static daysToEndOf(params: TFParams): number {
        if (params.range == TFRANGE.THEMONTH) {
            params.year = params.today.year;
            return TimeFrame.daysInMonth(params) - params.today.day;
        }
        else if (params.range >= TFMONTH.JAN && params.range <= TFMONTH.DEC) {
            let rangeEnd:DateTime = TimeFrame.nextOccurrenceOf(<number>params.range+1, 1).endOf('month');
            return rangeEnd.diff(params.today, 'days').days;
        }
        else if ((<string>params.range).startsWith('season#')) {
            const season = (<string>params.range).slice(7);
            const seasonEndDates = {
                [TFSEASON.SPRING]: {month: 6, date: 20},
                [TFSEASON.SUMMER]: {month: 9, date: 20},
                [TFSEASON.FALL]:   {month: 12, date: 20},
                [TFSEASON.WINTER]: {month: 3, date: 20},
            };

            let rangeEnd:DateTime = TimeFrame.nextOccurrenceOf(seasonEndDates[season].month, seasonEndDates[season].date);

            return rangeEnd.diff(params.today, 'days').days + 1; // include last day
        }
    }

    private static nextOccurrenceOf(month: number, date: number): DateTime {
        // Given a m/d, return a date (at midnight) for the next time that m/d occurs
        const today:DateTime = TimeFrame.today(<TFParams>{});

        const currentDate:number = today.day;
        const currentYear:number = today.year;
        const currentMonth:number = today.month;

        let desiredYear = currentYear;
        // Is next occurrence in next year?
        if (month < currentMonth || (month == currentMonth && currentDate > date)) {
            desiredYear += 1;
        }

        return DateTime.fromISO(String(desiredYear)+'-'+String(month).padStart(2, '0')+'-'+String(date).padStart(2, '0'));
    }

    private static intersect(array1:number[], array2:number[]):number[] {
        // This has nothing to do with BitSets, but a BitSet solution seems simple.
        const b1:BitSet = new BitSet(array1);
        const b2:BitSet = new BitSet(array2);
        const intersection:BitSet = b1.and(b2);

        let result:number[] = [];

        for (let i:number=0; i <= intersection.msb(); i++) {
            if (intersection.get(i) == 1) {
                result.push(i);
            }
        }
        return result;
    }

    private static isWeekday(d:DateTime, offset:number):boolean {
        const localDay:number = d.plus({days: offset}).weekday;
        return localDay >= TFDAY.MON && localDay <= TFDAY.FRI;
    }

}

const TFTable = {
    TODAY: {
        startDate: {
            func: TimeFrame.today,
            params: <TFParams>{}
        },
        span: {
            func: (x:TFParams):number => {return x.duration;},
            params: <TFParams>{duration: 24}
        },
        modifiers: undefined,
        modifierData: undefined
    },
    TOMORROW: {
        startDate: {
            func: TimeFrame.tomorrow,
            params: <TFParams>{}
        },
        span: {
            func: (x:TFParams) => {return x.duration;},
            params: <TFParams>{duration: 24}
        },
        modifiers: undefined,
        modifierData: undefined
    },
    WEEKEND: {
        startDate: {
            func: TimeFrame.whenis,
            params: <TFParams>{day: TFDAY.SAT, nextflag: false}
        },
        span: {
            func: (x:TFParams) => {return x.duration;},
            params: <TFParams>{duration: 48}
        },
        modifiers: undefined,
        modifierData: undefined
    },
    DOW: {
        startDate: {
            func: TimeFrame.whenis,
            // Set day before calling func. Allowable day values: any TFDAY.ddd
            params: <TFParams>{day: undefined, nextflag: false},
        },
        span: {
            func: (x:TFParams) => {return x.duration;},
            params: <TFParams>{duration: 24}
        },
        modifiers: undefined,
        modifierData: undefined
    },
    THIS: {
        startDate: {
            // Caller must set func; can be startofThisWeek or startofThisMonth
            func: undefined,
            params: <TFParams>{}
        },
        span: {
            func: (x:TFParams) => {
                if (x.range == TFRANGE.THISWEEK) {
                    return 24*7;
                }
                else {
                    x.year = x.today.year;
                    return TimeFrame.daysInMonth(x)*24
                }
            },
            params: <TFParams>{}
        },
        // Set modifiers values based on user input. Allowable narrower values:
        //   TFNARROWER.EARLY
        //   TFNARROWER.MIDDLE
        //   TFNARROWER.ENDOF
        modifiers: {
            narrower: undefined, weekendsPreferred: false, weekdaysPreferred: false
        },
        modifierData: (x:TFParams) => {
            if (x.range == TFRANGE.THISWEEK) {
                return {
                    // These are offsets from the start of the week (the week starts on Monday)
                    [TFNARROWER.EARLY]:  {includes: [0, 1]},
                    [TFNARROWER.MIDDLE]: {includes: [2, 3]},
                    [TFNARROWER.ENDOF]:  {includes: [4, 5, 6]},
                }
            }
            else {
                return {
                    // These are offsets from the start of the month
                    [TFNARROWER.EARLY]:  {includes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]},
                    [TFNARROWER.MIDDLE]: {includes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]},
                    [TFNARROWER.ENDOF]:  {includes: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]},
                }
            }
        }
    },
    WITHIN: {
        startDate: {
            func: TimeFrame.today,
            params: <TFParams>{}
        },
        span: {
            func: TimeFrame.hoursInRange,
            // Set range param before calling func. Allowable range values:
            //   TFRANGE.ONEWEEK
            //   TFRANGE.TWOWEEKS
            //   TFRANGE.ONEMONTH
            params: <TFParams>{range: undefined}
        },
        // Set modifiers values based on user input.
        modifiers: {
            weekendsPreferred: false, weekdaysPreferred: false
        },
        modifierData: undefined
    },
    BEFOREEND: {
        startDate: {
            func: TimeFrame.today,
            params: <TFParams>{}
        },
        span: {
            func: (x:TFParams) => {return TimeFrame.daysToEndOf(x)*24},
            // Set range param before calling func. Allowable range values:
            //   TFRANGE.THEMONTH
            //   TFMONTH.mmm
            //   TFSEASON.sxx
            params: <TFParams>{range: undefined}
        },
        // Set modifiers values based on user input.
        modifiers: {
            weekendsPreferred: false, weekdaysPreferred: false
        },
        modifierData: undefined
    }
};

const TimeTable = {
    [TFTIME.MORNING]: [9, 0, 2],
    [TFTIME.MIDDAY]: [11, 0, 2],
    [TFTIME.AFTERNOON]: [13, 0, 4],
    [TFTIME.AFTERWORK]: [17, 0, 2],
    [TFTIME.ATNIGHT]: [17, 0, 4],
    [TFACTIVITY.BREAKFAST]: [7, 2.5],
    [TFACTIVITY.LUNCH]: [11, 30, 2],
    [TFACTIVITY.DINNERDRINKS]: [18, 0, 2],
    [TFACTIVITY.WHATEVER]: [9, 0, 12]
};