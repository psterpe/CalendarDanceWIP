"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bitset_1 = require("bitset");
const luxon_1 = require("luxon");
const timeframe_1 = require("./timeframe");
const cdconfig_1 = require("./cdconfig");
class SlotMap {
    constructor(tz, startDate) {
        if (startDate) {
            this.startDate = startDate.setZone(tz).startOf('day');
        }
        else {
            this.startDate = luxon_1.DateTime.local().setZone(tz).startOf('day');
        }
        this.lastUpdated = luxon_1.DateTime.local();
        this.data = new bitset_1.BitSet();
        this.numbits = 0;
        this.tz = tz;
    }
    toDb() {
        let thisObject = Object.assign({}, this);
        if (this.numbits === 0) {
            thisObject['data'] = '';
        }
        else {
            thisObject['data'] = this.data.toString(2);
        }
        return thisObject;
    }
    static fromDb(smapDb) {
        let smap = new SlotMap(smapDb.tz);
        smap.startDate = smapDb.startDate.toDate === undefined ? smapDb.startDate : luxon_1.DateTime.fromJSDate(smapDb.startDate.toDate());
        smap.lastUpdated = smapDb.lastUpdated.toDate === undefined ? smapDb.lastUpdated : luxon_1.DateTime.fromJSDate(smapDb.lastUpdated.toDate());
        if (smapDb.data.length === 0) {
            smap.data = new bitset_1.BitSet;
        }
        else {
            smap.data = bitset_1.BitSet.fromBinaryString(smapDb.data);
        }
        smap.numbits = smapDb.data.length;
        smap.tz = smapDb.tz;
        return smap;
    }
    dateToBit(d) {
        if (d < this.startDate) {
            return -1;
        }
        const d_tz = d.setZone(this.tz);
        const startDate_tz = this.startDate.setZone(this.tz);
        let offsetMinutes = d_tz.diff(startDate_tz).minutes / (1000 * 60);
        return Math.ceil(offsetMinutes / cdconfig_1.MINUTES_PER_SLOT);
    }
    setBusy(from, to) {
        let lobit = this.dateToBit(from);
        let hibit = this.dateToBit(to);
        if (lobit < 0) {
            lobit = 0;
        }
        if (hibit > this.numbits - 1) {
            this.extend(to);
        }
        this.data.setRange(lobit, hibit - 1, cdconfig_1.BUSY);
    }
    extend(to) {
        let currentEnd = this.end();
        if (to < currentEnd) {
            return;
        }
        const momentEnd = currentEnd.startOf('day');
        const momentTo = to.startOf('day');
        const daysToAdd = Math.ceil(momentTo.diff(momentEnd).days);
        const bitstoAdd = daysToAdd * cdconfig_1.BITCOUNT_ONEDAY;
        this.data.setRange(this.numbits, this.numbits + bitstoAdd - 1, cdconfig_1.FREE);
        this.numbits = this.numbits + bitstoAdd;
    }
    static BitSetToString(bs, numbits) {
        if (numbits === 0) {
            return '';
        }
        let result = [];
        for (let index = 0; index < numbits; index++) {
            result.push(bs.get(index));
        }
        return result.reverse().join('');
    }
    static findOverlaps(tf, smaps) {
        let tranges = [];
        let argData = [
            {
                sdate: smaps[0].startDate,
                edate: smaps[0].startDate.plus({ hours: smaps[0].numbits / cdconfig_1.SLOTS_PER_HOUR }),
                extent: smaps[0].numbits,
                bitset: smaps[0].data
            },
            {
                sdate: smaps[1].startDate,
                edate: smaps[1].startDate.plus({ hours: smaps[1].numbits / cdconfig_1.SLOTS_PER_HOUR }),
                extent: smaps[1].numbits,
                bitset: smaps[1].data
            },
        ];
        for (let tr of tf.timeRanges) {
            argData.push({
                sdate: tr.startDate,
                edate: tr.getEndDate(),
                extent: tr.getHighBit() + 1,
                bitset: tr.getBitSet()
            });
        }
        let minStartDate = luxon_1.DateTime.min(...argData.map(x => x.sdate));
        let maxEndDate = luxon_1.DateTime.max(...argData.map(x => x.edate));
        let maskLength = maxEndDate.diff(minStartDate, 'hours').hours * cdconfig_1.SLOTS_PER_HOUR;
        let bitMask = new bitset_1.BitSet().setRange(0, maskLength - 1, 0);
        let allBitSets = [];
        for (let argd of argData) {
            let padBitsBefore = argd.sdate.diff(minStartDate, 'hours').hours * cdconfig_1.SLOTS_PER_HOUR;
            let padStringBefore = SlotMap.BitSetToString(new bitset_1.BitSet(), padBitsBefore);
            let padBitsAfter = maxEndDate.diff(argd.edate, 'hours').hours * cdconfig_1.SLOTS_PER_HOUR;
            let padStringAfter = SlotMap.BitSetToString(new bitset_1.BitSet(), padBitsAfter);
            let bsString = SlotMap.BitSetToString(argd.bitset, argd.extent);
            let fullString = padStringAfter + bsString + padStringBefore;
            allBitSets.push(new bitset_1.BitSet(fullString));
        }
        for (const bs of allBitSets.slice(2)) {
            bitMask = bitMask.or(bs);
        }
        bitMask = bitMask.and(allBitSets[0]);
        bitMask = bitMask.and(allBitSets[1]);
        const re = /1+/g;
        const bitMaskString = SlotMap.BitSetToString(bitMask, bitMask.msb() + 1);
        let match = null;
        const L = bitMaskString.length;
        while ((match = re.exec(bitMaskString)) != null) {
            const a = match.index;
            const b = a + match[0].length - 1;
            const b_from_right = L - b - 1;
            const b_from_right_time = minStartDate.plus({ hours: b_from_right / cdconfig_1.SLOTS_PER_HOUR });
            const midnight = b_from_right_time.startOf('day');
            const diff = b_from_right_time.diff(midnight, 'hours');
            const startHour = Math.trunc(diff.hours);
            const startMinute = diff.minutes % 60;
            const matchLength = match[0].length;
            const numHours = matchLength / cdconfig_1.SLOTS_PER_HOUR;
            tranges.push(new timeframe_1.TimeRange(midnight, startHour, startMinute, numHours));
        }
        return tranges;
    }
    toObject() {
        let bits = this.data.toString();
        bits = bits.padStart(this.numbits, String(cdconfig_1.FREE));
        let chunkArray = [];
        const days_in_slotmap = this.numbits / cdconfig_1.BITCOUNT_ONEDAY;
        for (let i = 0; i < days_in_slotmap; i++) {
            let startIndex = (days_in_slotmap - i - 1) * cdconfig_1.BITCOUNT_ONEDAY;
            let daychunk = bits.substr(startIndex, cdconfig_1.BITCOUNT_ONEDAY);
            daychunk = daychunk.split('').reverse().join('');
            let daychunkArray = daychunk.match(/.{2}/g);
            chunkArray.push(daychunkArray);
        }
        return {
            startDate: this.startDate,
            endDate: this.end(),
            days: this.numbits / cdconfig_1.BITCOUNT_ONEDAY,
            data: chunkArray
        };
    }
    toLogString() {
        let output = [];
        output.push(`startDate: ${this.startDate}`);
        output.push(`lastUpdated: ${this.lastUpdated}`);
        output.push(`tz: ${this.tz}`);
        output.push(`numbits: ${this.numbits}`);
        output.push(`last date: ${this.end()}`);
        output.push(`daysInSmap: ${this.numbits / cdconfig_1.BITCOUNT_ONEDAY}`);
        return output.join('\n');
    }
    end() {
        const daysRepresented = this.numbits / cdconfig_1.BITCOUNT_ONEDAY;
        return this.startDate.plus({ days: daysRepresented - 1 }).endOf('day');
    }
    days() {
        return this.numbits / cdconfig_1.BITCOUNT_ONEDAY;
    }
}
exports.SlotMap = SlotMap;
//# sourceMappingURL=slotmap.js.map