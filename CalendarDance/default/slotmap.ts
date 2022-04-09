import { BitSet } from 'bitset';
import { DateTime } from 'luxon';
import { TimeFrame, TimeRange } from './timeframe';
import { ISlotMap } from './dal';
import {
    MILLISECONDS_PER_DAY,
    FREE,
    BUSY,
    MINUTES_PER_SLOT,
    SLOTS_PER_HOUR,
    BITCOUNT_ONEDAY,
    SLOTMAP_FETCH,
    MILLISECONDS_PER_HOUR
} from './cdconfig';

export class SlotMap {
    startDate:   DateTime;     // Midnight (in user's TZ) on the first date of the SlotMap
    lastUpdated: DateTime;     // Timestamp in UTC
    data:        BitSet;   // BitSet representing free/busy slots
    numbits:     number;   // # of significant bits in BitSet. Given that BitSets are infinite, this tracks
                           // how far out our BitSet actually goes
    tz:          string;   // Standard string representing the user's local time zone.

    constructor(tz:string, startDate?:DateTime) {
        if (startDate) {
            this.startDate = startDate.setZone(tz).startOf('day');
        }
        else {
            this.startDate = DateTime.local().setZone(tz).startOf('day');
        }
        this.lastUpdated = DateTime.local();
        this.data = new BitSet();
        this.numbits = 0;
        this.tz = tz;
    }

    public toDb(): ISlotMap {
        // Returns an object shaped like a SlotMap that is suitable for sending to database
        let thisObject:{} = {...this};

        // Most of a SlotMap serializes just fine. It's the BitSet that we need to deal with.
        if (this.numbits === 0) {
            thisObject['data'] = '';
        }
        else {
            thisObject['data'] = this.data.toString(2);
        }

        return <ISlotMap>thisObject;
    }

   public static fromDb(smapDb:ISlotMap):SlotMap {
       let smap:SlotMap = new SlotMap(smapDb.tz);

       smap.startDate = smapDb.startDate.toDate === undefined ? smapDb.startDate as any as DateTime : DateTime.fromJSDate(smapDb.startDate.toDate());
       smap.lastUpdated = smapDb.lastUpdated.toDate === undefined ? smapDb.lastUpdated as any as DateTime : DateTime.fromJSDate(smapDb.lastUpdated.toDate());

       if (smapDb.data.length === 0) {
           smap.data = new BitSet;
       }
       else {
           smap.data = BitSet.fromBinaryString(smapDb.data);
       }
       smap.numbits = smapDb.data.length;
       smap.tz = smapDb.tz;

       return smap;
   }

   public dateToBit(d:DateTime):number {
       // For the given date (which also includes the time of day), return the bit position in the bitset corresponding
       // to this date and time. Return -1 if the date is before the startDate of the SlotMap.

       if (d < this.startDate) {
           return -1;
       }

       const d_tz = d.setZone(this.tz);
       const startDate_tz = this.startDate.setZone(this.tz);
       let offsetMinutes:number = d_tz.diff(startDate_tz).minutes / (1000 * 60);
       return Math.ceil(offsetMinutes / MINUTES_PER_SLOT);
   }

   public setBusy(from:DateTime, to:DateTime):void {
        // In the slotmap's bitset, set to BUSY those bits between the 'from' and 'to' dates, inclusive.
       let lobit:number = this.dateToBit(from);
       let hibit:number = this.dateToBit(to);

       // If lobit out of range, we don't extend SlotMaps into the past, so just set lobit to 0
       if (lobit < 0) {
           lobit = 0;
       }

       // If hibit is beyond the current extent of the SlotMap, extend the
       // SlotMap to include the 'to' date.
       if (hibit > this.numbits - 1) {
           this.extend(to);
       }

       this.data.setRange(lobit, hibit-1, BUSY);
   }

   private extend(to:DateTime):void {
        let currentEnd:DateTime = this.end();
        if (to < currentEnd) {
            return;
        }

        const momentEnd:DateTime = currentEnd.startOf('day');
        const momentTo:DateTime = to.startOf('day');

        const daysToAdd = Math.ceil(momentTo.diff(momentEnd).days);
        const bitstoAdd = daysToAdd * BITCOUNT_ONEDAY;

        // Extend the SlotMap
        this.data.setRange(this.numbits, this.numbits + bitstoAdd - 1, FREE);
        this.numbits = this.numbits + bitstoAdd;
   }

    /**
     * Return a string of 1s and 0s representing the bits in the given BitSet.
     * This is different from the native BitSet toString method, because that method eliminates insignificant
     * bits, i.e., high end bits that are 0.
     *
     * @param bs        A BitSet
     * @param numbits   number of significant bits we want
     */
   public static BitSetToString(bs:BitSet, numbits:number):string {
       if (numbits === 0) {
           return '';
       }

       let result:number[] = [];

       for (let index:number = 0; index < numbits; index++) {
           result.push(bs.get(index));
       }

       return result.reverse().join('');
   }

   public static findOverlaps(tf: TimeFrame, smaps:SlotMap[]):TimeRange[] {
       // Strategy is
       //   - create a mask of 1s stretching from the min startDate to max endDate
       //     across all bitsets from both slotmaps in smaps and all TimeRanges in tf
       //   - For each bitset from both slotmaps in smaps and all TimeRanges in tf:
       //       * pad with 0s (fore and aft) so bitset has same length as 1s mask
       //       * AND the bitset into the 1s mask
       //   - The 1s that remain are the overlaps; convert them to an array of TimeRanges

       let tranges:TimeRange[] = [];

       // Get startDate, numbits, and BitSet from all arguments; start with SlotMaps
       let argData:any = [
           {
               sdate:smaps[0].startDate,
               edate: smaps[0].startDate.plus({hours: smaps[0].numbits/SLOTS_PER_HOUR}),
               extent:smaps[0].numbits,
               bitset:smaps[0].data
           },
           {
               sdate:smaps[1].startDate,
               edate: smaps[1].startDate.plus({hours: smaps[1].numbits/SLOTS_PER_HOUR}),
               extent:smaps[1].numbits,
               bitset:smaps[1].data},
       ];

       // Now add all TimeRanges in tf
       for (let tr of tf.timeRanges) {
           argData.push({
               sdate:tr.startDate,
               edate: tr.getEndDate(),
               extent:tr.getHighBit() + 1,
               bitset:tr.getBitSet()
           });
       }

       let minStartDate:DateTime = DateTime.min(...argData.map(x => x.sdate));
       let maxEndDate:DateTime = DateTime.max(...argData.map(x => x.edate));

       // Given minStartDate and maxEndDate, determine bit length of 1s mask
       let maskLength = maxEndDate.diff(minStartDate, 'hours').hours * SLOTS_PER_HOUR;

       let bitMask:BitSet = new BitSet().setRange(0, maskLength-1, 0);

       // First create the padded BitSets so they all have the same startDate and same size
       let allBitSets = [];
       for (let argd of argData) {
           let padBitsBefore = argd.sdate.diff(minStartDate, 'hours').hours * SLOTS_PER_HOUR;
           let padStringBefore:string = SlotMap.BitSetToString(new BitSet(), padBitsBefore);

           let padBitsAfter = maxEndDate.diff(argd.edate, 'hours').hours * SLOTS_PER_HOUR;
           let padStringAfter:string = SlotMap.BitSetToString(new BitSet(), padBitsAfter);

           let bsString:string = SlotMap.BitSetToString(argd.bitset, argd.extent);

           // Time in our BitSets goes LSB-to-MSB, i.e., right-to-left, so to add bits "before," add at end of string
           let fullString:string = padStringAfter + bsString + padStringBefore;

           allBitSets.push(new BitSet(fullString));
       }

       // Now OR together the BitSets from the TimeRanges (all but the first two in allBitSets).
       for (const bs of allBitSets.slice(2)) {
           bitMask = bitMask.or(bs);
       }

       // Now AND together the bitMask (which should have some 1s in it) with the BitSets
       // from the user's slotmaps.
       bitMask = bitMask.and(allBitSets[0]);
       bitMask = bitMask.and(allBitSets[1]);

       // Any 1s that remain in bitMask are the overlaps we're looking for. Return those as an array of TimeRanges
       const re = /1+/g;

       const bitMaskString = SlotMap.BitSetToString(bitMask, bitMask.msb() + 1);

       // Suppose bitMaskString is 11110000000001111...
       //
       // 11110000000001111   <-- bitMaskString
       // a  b         c  d
       //
       // If 'match' represents a given match, e.g., the a..b match
       // or the c..d match:
       //
       // a = match.index            (0)
       // b = a + match.length - 1   (3)
       //
       // b represents the start time of the a..b range (time goes r-to-l).
       // Where is b relative to the right end of the bitMaskString?
       //
       // L = bitMaskString.length   (17)
       // b_from_right = L - b - 1   (13)
       //
       // What date/time does b represent?
       // It's b_from_right slots from the right, at 2 slots per hour.
       // If bitMaskString starts at date/time dt, then b_from_right
       // represents:
       //
       // dt + (b_from_right / 2) hours

       let match = null;
       const L = bitMaskString.length;

       while ((match = re.exec(bitMaskString)) != null) {
           const a = match.index;
           const b = a + match[0].length - 1;
           const b_from_right = L - b - 1;
           const b_from_right_time = minStartDate.plus({hours: b_from_right / SLOTS_PER_HOUR});

           const midnight = b_from_right_time.startOf('day');
           const diff = b_from_right_time.diff(midnight, 'hours');
           const startHour = Math.trunc(diff.hours);
           const startMinute = diff.minutes % 60;
           const matchLength = match[0].length;
           const numHours = matchLength / SLOTS_PER_HOUR;

           tranges.push(new TimeRange(midnight, startHour, startMinute, numHours));
       }

       return tranges;
   }

   public toObject() {
       // JSON representation of the BitSet component, for debugging.

       // BitSet.toString() stops at the most significant bit -- a 1. If we are keeping track of zeroes
       // that would be to the left of that bit, they'll be absent from the toString() result. To account for that,
       // we left-pad with FREE values.
       let bits:string = this.data.toString();
       bits = bits.padStart(this.numbits, String(FREE));

       // Construct a useful representation of the 'bits' string. Every BITCOUNT_ONEDAY characters represent a day.
       // We print each day's characters on its own line, preceded by the date those bits represent. The bitset string
       // is arranged as a computer word would be, i.e., its 0th index is the MSB, and its last index is the LSB.
       // Also, time runs right to left in the string, so the first characters represent the last day in the range
       // of the slotmap. The last character of the string represents midnight on the first day in the range of
       // the slotmap.

       // First split the bits string into an array of strings each of which represents a day.
       // Work 'right-to-left,' so that the last BITCOUNT_ONEDAYS characters in the string become the first array
       // element, etc.
       //
       // Working with smaller numbers, suppose there are 5 characters per day and 4 days in the string. The string
       // would be like this (spaces added for readability):
       //
       //          12345 abcde 67890 fghij
       //          ----- ----- ----- -----
       // Day -->    3     2     1     0
       //
       // We want to split this into an array that comes out like this:
       //
       //  [0]:  fghij
       //  [1]:  67890
       //  [2]:  abcde
       //  [3]:  12345

       let chunkArray:string[][] = [];
       const days_in_slotmap = this.numbits / BITCOUNT_ONEDAY;

       for (let i=0; i < days_in_slotmap; i++) {
           let startIndex:number = (days_in_slotmap - i - 1) * BITCOUNT_ONEDAY;
           let daychunk:string = bits.substr(startIndex, BITCOUNT_ONEDAY);

           // Reverse it so hours are represented ascending
           daychunk = daychunk.split('').reverse().join('');

           let daychunkArray:string[] = daychunk.match(/.{2}/g);

           chunkArray.push(daychunkArray);
       }

       return {
           startDate: this.startDate,
           endDate: this.end(),
           days: this.numbits / BITCOUNT_ONEDAY,
           data: chunkArray
       };
   }

    /**
     * Return a string representation of the SlotMap suitable for logging.
     */
    public toLogString():string {
        let output:string[] = [];
        output.push(`startDate: ${this.startDate}`);
        output.push(`lastUpdated: ${this.lastUpdated}`);
        output.push(`tz: ${this.tz}`);
        output.push(`numbits: ${this.numbits}`);
        output.push(`last date: ${this.end()}`);
        output.push(`daysInSmap: ${this.numbits / BITCOUNT_ONEDAY}`);

        return output.join('\n');
    }

   public end():DateTime {
       // Returns the end of the last day that the slotmap represents.
       const daysRepresented:number = this.numbits / BITCOUNT_ONEDAY;
       return this.startDate.plus({days: daysRepresented - 1}).endOf('day');
   }

   public days():number {
       // How many days the SlotMap represents
       return this.numbits / BITCOUNT_ONEDAY;
   }
}
