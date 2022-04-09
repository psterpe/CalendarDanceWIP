import React, {useState, useEffect} from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import { DateTime } from 'luxon';

const cellMinHeight = '20px';
const cellMinWidth = '20px';

const UNSELECTABLE = 0;
const SELECTABLE_UNSELECTED = 1;
const SELECTABLE_SELECTED = 2;

// Times of day at which grid should have a visible gap to enhance readability
const BREAKS = [1200, 1700];

const useStyles = makeStyles({
    dayHeader: {
        backgroundColor: 'thistle',
        marginLeft: "2px",
        fontSize: "9pt",
        minWidth: cellMinWidth
    },
    monday: {
        "&:hover": {
            backgroundColor: "lightblue"
        }
    },
    dayHeaderText: {
        textAlign: "center",
        writingMode: "vertical-rl"
    },
    grid: {
        marginLeft: "10px",
        width: "auto",
        backgroundColor: "blanchedalmond"
    },
    cell: {
        marginLeft: "2px",
        minHeight: cellMinHeight,
        minWidth: cellMinWidth
    },
    openlight: {
        backgroundColor: 'white',
        border: 'solid gray 1px',
    },
    closedlight: {
        backgroundColor: 'darkslateblue',
    },
    pickedlight: {
        backgroundColor: 'lightseagreen',
    },
    openshaded: {
        backgroundColor: '#ababab',
        border: 'solid gray 1px',
    },
    closedshaded: {
        backgroundColor: 'darkslateblue',
    },
    pickedshaded: {
        backgroundColor: 'lightseagreen',
    },
    bodyrow: {
        marginTop: "2px"
    },
    time: {
        textAlign: "right",
        paddingRight: "5px",
        paddingTop: "2px",
        minWidth: "4%"
    },
    breakrow: {
        marginTop: '20px'
    }
});

const within = (rTable, dt, slot) => {
    for (const row of rTable) {
        if (row.dt.equals(dt) && slot >= row.low && slot < row.high) {
            return SELECTABLE_UNSELECTED;
        }
    }
    return UNSELECTABLE;
};

// Helper function to get quotient and remainder as integers
const qr = (dividend, divisor) => [Math.floor(dividend/divisor), dividend % divisor];

const clockPlus = (slot, increment) => {
    // slot is a number in military time, e.g., 930, 1300
    let [hour, minutes] = qr(slot, 100);
    minutes += increment;
    let [hourCarry, remainingMinutes] = qr(minutes, 60);
    hour += hourCarry;

    return hour * 100 + remainingMinutes;
}

let bdata = [];  // Will become argument to setBodyData

export const TimeSlotGrid = (props) => {
    const [docid, setDocid] = useState('');
    const [bodyData, setBodyData] = useState(bdata);
    const [numDays, setNumDays] = useState(0);
    const [firstDay, setFirstDay] = useState(undefined);
    const [mondays, setMondays] = useState([]);

    const classes = useStyles();

    useEffect(() => {
        if (props.docid === docid) {
            return;
        }
        else {
            setDocid(props.docid);
        }

        const fDay = firstDay || DateTime.fromSeconds(props.options[0].startDate._seconds);
        if (!firstDay) {
            setFirstDay(fDay);
        }

        // props.options is an array of ITimeRange objects
        // Note that minStartTime and maxEndTime will be numbers in military time, e.g., 900 or 2230.
        const [minStartTime, maxEndTime, lastDay] = props.options.reduce(([prevMin,prevMax, prevLast], curr)=>
        [
            Math.min(prevMin, curr.startHour*100+curr.startMinute),
            Math.max(prevMax, clockPlus(curr.startHour*100+curr.startMinute, curr.numHours*60)),
            // We don't need the time of day, just what day the current TimeRange represents
            DateTime.max(prevLast, DateTime.fromSeconds(curr.startDate._seconds))
        ], [Infinity, -Infinity, DateTime.fromMillis(0)]);


        const nDays = numDays || Math.floor(lastDay.diff(fDay, 'days').days) + 1;
        if (!numDays) {
            setNumDays(nDays);
        }

        // Each element of bodyData will represent a 'line' (30-minute interval) in
        // the body of the grid. Each 'line' needs to contain:
        //     - the time slot, e.g., 900, 1030, 1330, etc.
        //     - an array of elements, one for each day represented by the ITimeRanges in
        //       props.options; each element indicates whether the time slot is open
        //       (not grayed out, i.e., within a TimeRange for that day),
        //       or closed (grayed out, i.e., outside all the TimeRanges for that day)
        //
        // The lines will go in 30-minute increments from minStartTime to maxEndTime (less 30 minutes,
        // e.g., if the maxEndTime is 1200, the last line of the grid should be the 1130 line).
        //
        // The ITimeRanges in props.options are sorted in ascending order of startDate

        const rangeTable = props.options.map((tr) => {
            return {
                dt: DateTime.fromSeconds(tr.startDate._seconds),
                low: tr.startHour * 100 + tr.startMinute,
                high: clockPlus(tr.startHour * 100 + tr.startMinute, tr.numHours*60)
            }
        });

        const formatTime = (timeslot) => {
            // Given a 24-hour timeslot integer like 900 or 1430, return a string in 12-hour format with
            // an 'a' or 'p' appended for am or pm.
            let [hour, minutes] = qr(timeslot, 100);
            let suffix='', zeropad='', timestring='';

            if (hour < 12) {
                suffix = 'a';
            }
            else if (hour > 12) {
                hour -= 12;
                suffix = 'p';
            }
            else if (minutes === 0) {   // We know hour === 12
                timestring = 'Noon';
            }
            else {
                suffix = 'p';
            }

            if (minutes < 10) {
                zeropad = '0';
            }

            timestring = timestring || `${hour}:${zeropad}${minutes}${suffix}`;

            return timestring;
        };

        // Push header row data into bdata. Also set mondays array at this time, one 'true'
        // element for each Monday we encounter.
        bdata = [];
        let header = [];

        // We start mondayCounter (variable we will use to index into the mondays array -- below)
        // at 0. The first cells we hit before we hit a Monday won't be collapsible, so we just
        // set the 0th index of the mondays array as true, meaning "yes, do display."
        let mcopy = [true];

        for (let i=0; i < nDays; i++) {
            let dt = fDay.plus({days: i});
            if (dt.weekday === 1) {
                mcopy.push(true);
            }
            header.push(
                {
                    name: dt.toFormat('ccc'),
                    date: dt.toFormat('M/d'),
                    monday: dt.weekday === 1
                }
            )
        }
        setMondays(mcopy);
        bdata.push({slot: undefined, displaySlot: 'Time', days: header});

        // Push body row data into bdata
        for (let timeslot = minStartTime; timeslot < maxEndTime; timeslot = clockPlus(timeslot, 30)) {
            let row = {slot: timeslot, displaySlot: formatTime(timeslot), days: []};

            for (let dayCount = 0; dayCount < nDays; dayCount++) {
                const thisDt = fDay.plus({days: dayCount});
                row.days.push({dayval: within(rangeTable, thisDt, timeslot), monday: thisDt.weekday === 1});
            }
            bdata.push(row);
        }

        setBodyData(bdata);

    }, [firstDay, numDays, bodyData, props.options, props.docid, docid]);

    const cellClick = (r, c) => {
        const curval = bodyData[r].days[c].dayval;

        if (curval !== UNSELECTABLE) {
            const newval = curval === SELECTABLE_UNSELECTED ? SELECTABLE_SELECTED : SELECTABLE_UNSELECTED;

            let copy = JSON.parse(JSON.stringify(bodyData));
            copy[r].days[c].dayval = newval;
            setBodyData(copy);
        }
    };

    let shading = 'light';
    const cellKind = (day) => day === UNSELECTABLE ? classes['closed'+shading] : day === SELECTABLE_UNSELECTED ? classes['open'+shading] : classes['picked'+shading];

    const rowKind = (slot) =>  BREAKS.indexOf(slot) !== -1 ? classes.breakrow : '';

    const toggleMonday = (e) => {
        const div = e.target.closest('[data-monday]');
        const monday = div.dataset.monday;
        let mcopy = mondays.slice();
        mcopy[monday] = mcopy[monday] === true ? 'none' : true;
        setMondays(mcopy);
    };

    const BodyRow = (props) => {
        let mondayCounter = 0;
        shading = 'light';

        return (
            <Grid container className={`${classes.bodyrow} ${rowKind(props.slot)}`}>
                <Grid item xs={'auto'} className={classes.time}>
                    {props.displaySlot}
                </Grid>
                <Grid item>
                      <Grid container>
                          {props.days.map((day, i) => {
                              if (day.monday) {
                                  mondayCounter += 1
                                  shading = shading === 'light' ? 'shaded': 'light';
                              }
                              return (
                                  <React.Fragment key={i}>
                                      {props.r > 0 &&
                                      <Grid item xs={'auto'}
                                            className={`${classes.cell} ${cellKind(day.dayval)}`}
                                            data-monday={mondayCounter}
                                            style={{display: day.monday ? true : mondays[mondayCounter]}}
                                            onClick={(e) => {
                                                cellClick(props.r, i)
                                            }}
                                      >&nbsp;&nbsp;&nbsp;&nbsp;</Grid>
                                      }
                                      {props.r === 0 &&
                                      <Grid item xs={'auto'}
                                            className={`${classes.dayHeader} ${day.monday ? classes.monday : ''}`}
                                            data-monday={mondayCounter}
                                            style={{display: day.monday ? true : mondays[mondayCounter]}}
                                            onClick={day.monday ? toggleMonday : null}
                                      >
                                          <Grid container>
                                              <Grid item className={classes.dayHeaderText}>
                                                  {day.name} {day.date}
                                              </Grid>
                                          </Grid>
                                      </Grid>
                                      }
                                  </React.Fragment>
                              )
                          })
                          }
                      </Grid>
                </Grid>
            </Grid>
        )
    };

    return (
        <div>
            <Grid container className={classes.grid}>
                {bodyData.length > 0 && bodyData.map((bdataRow, i) => {
                    return (
                        <BodyRow key={i} r={i} {...bdataRow}></BodyRow>
                    )
                })
                }
            </Grid>
        </div>
    )
}

export default TimeSlotGrid;