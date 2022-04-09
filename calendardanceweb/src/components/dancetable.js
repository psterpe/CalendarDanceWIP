import React, {useState, useEffect} from 'react';
import {
    Button,
    InputGroup,
    Card,
    Elevation,
    Collapse,
    ButtonGroup,
    Dialog,
    Checkbox,
    Icon,
    Label,
    OverflowList,
    Popover} from '@blueprintjs/core';
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
    SPECIAL_USER_SCANNER} from '../cdconfig';
import {MutexControlGroup} from './mcg';
import {TimeSlotGrid} from './timeslotgrid';
import {_t, whenPhrase, formatTs} from '../translate';
import { DateTime }from 'luxon';

const lc = 'en';

const SELECTSTYLE_SINGLE = 0;
const SELECTSTYLE_MULTI = 1;
const SELECTSTYLE_GRID = 2;

const propsCompare = (prev, next) => {
    console.log('propsCompare!');
    if (
        next.show !== prev.show ||
        next.activeDances.length !== prev.activeDances.length
    ) {
        return false;
    }

    for (let i=0; i<next.activeDances.length; i++) {
        if (next.activeDances[i].whoseTurn !== prev.activeDances[i].whoseTurn) {
            return false;
        }
    }
    return true;
};

const DanceActions = React.memo((props) => {
    console.log('DanceActions render');

    const [chosenAction, setChosenAction] = useState(()=>{return -1});

    const findDanceByDocid = (docid) => {
        return props.activeDances.filter((dance, idx)=> {return dance.docId === docid})[0];
    };

    const DANCEDATA = (docid, prop) => {
        const d = findDanceByDocid(docid);

        const retval = typeof(prop) !== 'function' ? d[prop] : prop(d);
        return Promise.resolve(retval);
    };

    const PROPOSE = (docid) => {
        return new Promise((res, rej) => {
            const cb = (body) => {
                props.statecbs.setPostDanceCallback(undefined);
                res(body);
            };
            const dance = findDanceByDocid(docid);
            props.statecbs.setInitialDanceParams({
                tftoken: dance.history[0].tftoken,
                tfparams: dance.history[0].tfparams
            });
            props.statecbs.setRecipientEmail(dance.recipient.email);
            props.statecbs.setPostDanceCallback(() => cb); // Inline so that React doesn't call the func immediately
            props.statecbs.setStartNewDance(true);
        });
    };

    const CHOICE = (docid, metadata) => {
        return new Promise((res, rej) => {
            const cb = (value) => {
                res(value);
            };

            props.statecbs.setQueryProps({...metadata, callback:cb, docid:docid});
            props.statecbs.setAskForValue(true);
        });
    };

    const VALUE = (v) => Promise.resolve(v);

    const getOptions = (docid) => {
        const dance = findDanceByDocid(docid);
        return dance.history[dance.latestStateIndex].options;
    }

    // danceStates describes states a dance could be in and what we need in the UI so the
    // user can put a dance in a given state. This is not an exhaustive list of
    // states; states represented here are ones that a user can put a dance in by explicit
    // action. There are other states a dance can arrive in without user action, e.g., due
    // to the scanner service.
    const danceStates = {
        [DANCE_STATE.ACCEPT]: {
            stateVerb: _t(lc, DANCE_ACTION.ACCEPT),
            route: '/dance/s/accept',
            payload: {
                danceId: (docid, perspective)=>{return DANCEDATA(docid, 'docId')}
            }
        },
        [DANCE_STATE.QUIT]: {
            stateVerb: _t(lc, DANCE_ACTION.QUIT),
            route: '/dance/s/quit',
            payload: {
                danceId: (docid, perspective)=>{return DANCEDATA(docid, 'docId')}
            }
        },
        [DANCE_STATE.SNOOZE]: {
            stateVerb: _t(lc, DANCE_ACTION.SNOOZE),
            route: '/dance/s/snooze',
            payload: {
                danceId: (docid, perspective)=>{return DANCEDATA(docid, 'docId')},
                deferral: (docid, perspective)=>{return CHOICE(docid, {
                    title:'Length of deferral',
                    prompt: 'Defer for how long?',
                    selectStyle: SELECTSTYLE_SINGLE,
                    why: 'defer',
                    options: [
                        {v: -1, t: 'Choose...'},
                        {v: DANCE_DEFERRAL.COUPLEDAYS, t: _t(lc, DANCE_DEFERRAL.COUPLEDAYS)},
                        {v: DANCE_DEFERRAL.AWEEK, t: _t(lc, DANCE_DEFERRAL.AWEEK)},
                        {v: DANCE_DEFERRAL.COUPLEWEEKS, t: _t(lc, DANCE_DEFERRAL.COUPLEWEEKS)},
                        {v: DANCE_DEFERRAL.NEXTMONTH, t: _t(lc, DANCE_DEFERRAL.NEXTMONTH)}
                    ]})
                }
            }
        },
        [DANCE_STATE.NEGOTIATE]: {
            stateVerb: _t(lc, DANCE_ACTION.PROPOSE),
            route: '/dance/s/negotiate',
            payload: {
                danceId: (docid, perspective)=>{return DANCEDATA(docid, 'docId')},
                proposal: (docid, perspective)=>{return PROPOSE(docid)}
            }
        },
        [DANCE_STATE.CHOOSE]: {
            stateVerb: _t(lc, DANCE_ACTION.CHOOSE),
            route: '/dance/s/choose',
            payload: {
                danceId: (docid, perspective)=>{return DANCEDATA(docid, 'docId')},
                perspective: (docid, perspective)=>{return VALUE(perspective)},
                alternative: (docid, perspective)=>{return CHOICE(docid,
                    {
                        title:'CalendarDance Found Some Options',
                        prompt: 'Select one or more options',
                        selectStyle: SELECTSTYLE_GRID,
                        why: 'pickoption',
                        options: getOptions
                    }
                )
                }
            },
            // Optional filtering function that can cause (by returning false) this
            // option (e.g., 'Select an option' and everything that goes with it) not to appear in the user's
            // menu of actions. The function gets two arguments, the dance for which we're constructing
            // the action menu, and the user's perspective ('sender' or 'recipient').
            //
            // For this case (the CHOOSE action), we don't want the sender/recipient to have the 'Select an option'
            // action if that user has already selected one.
            filter: (dance, perspective) => dance.history[dance.latestStateIndex]['choices' + perspective.charAt(0).toUpperCase() + perspective.slice(1)] === undefined
        },
    };

    // Each key is a state; each value is an array of states (from the danceStates variable above)
    // to which a user can transition a state. Each array element essentially represents an action
    // a user can take when the dance is in the state denoted by the key.

    // In danceStateGraph, we allow for separate graphs for sender and recipient to give us the
    // future flexibility to confine an action to either sender or recipient.
    const stateGraph = {
        [DANCE_STATE.CHOOSE]: [
            danceStates[DANCE_STATE.CHOOSE],
            danceStates[DANCE_STATE.SNOOZE],
            danceStates[DANCE_STATE.NEGOTIATE],
            danceStates[DANCE_STATE.QUIT]
        ],
        [DANCE_STATE.NEGOTIATE]: [
            danceStates[DANCE_STATE.NEGOTIATE],
            danceStates[DANCE_STATE.SNOOZE],
            danceStates[DANCE_STATE.ACCEPT],
            danceStates[DANCE_STATE.QUIT]
        ]
        // TODO: Add SNOOZE and any other states...
    };

    const danceStateGraph = {
        sender: stateGraph,
        recipient: stateGraph  // Intentionally same as sender graph for now
    };

    let actions = [null];
    let options = [<option key={-1} value={-1}>What next?</option>];
    const latestState = props.dance.history[props.dance.latestStateIndex].state;

    let optionValue = 1;
    danceStateGraph[props.perspective][latestState].forEach((data, i)=> {
        // NOTE: Do not use 'i' as the option value. We will later use the option value as an
        // index into the actions array, and since we might filter out some choices, the values
        // of i that we keep might not be consecutive and would be wrong as indices. Do it the
        // old fashioned way -- keep a counter, i.e., optionValue.
        if (!data.filter || (data.filter && data.filter(props.dance, props.perspective))) {
            options.push(<option key={optionValue} value={optionValue}>{data.stateVerb}</option>);
            optionValue += 1;
            actions.push({route: data.route, payload: data.payload});
        }
    });

    const handleChoice = (docid) => {
        if (chosenAction === -1) {
            alert('First choose what to do next');
            return;
        }

        // Call payload functions. Each returns a Promise.
        let newPayload = {};
        let newPayloadPromises = [];
        let newPayloadKeys = [];

        Object.entries(actions[chosenAction].payload).forEach((e, i) => {
            const p = e[1](docid, props.perspective);
            newPayloadPromises.push(p);
            newPayloadKeys.push(e[0]);
        });

        // All the values in newPayload are Promises. Let's wait for them all to resolve,
        // then replace each Promise with its settled value. If any settled value is null,
        // this means the user cancelled, so do not sent to backend.

        Promise.all(newPayloadPromises).then((values) => {

            // Check for any settled value that is null. Don't submit to backend if found.
            const anyNull = values.some(x => x===null);
            if (anyNull) {
                setChosenAction(-1); // put the <select> back to initial condition
                return;
            }

            values.forEach((v, i) => {
                newPayload[newPayloadKeys[i]] = v;
            });

            // OK, newPayload now contains its values. We can send to backend.
            props.statusMessage(true, 'Saving data...');

            props.alterDance(props.constants.BACKEND + actions[chosenAction].route, newPayload);

        });
    };

    const handleSelect = (e) => {
        setChosenAction(e.currentTarget.value);
    };

    return (
        <div>
            {options.length > 1 &&
                <>
                    <select onChange={handleSelect} value={chosenAction}>
                        {options}
                    </select>
                    <Button
                        type="button"
                        className="calendardance-button-grid"
                        intent="primary"
                        onClick={() => handleChoice(props.dance.docId)}
                    >
                        Do it
                    </Button>
                </>
            }
            {options.length <= 1 &&
                <span>Wait ...</span>
            }
        </div>
    )
});

const DanceHistory = React.memo(function DanceHistory(props) {
    const [showDanceHistory, setShowDanceHistory] = useState('notshown');
    const [moreIcon, setMoreIcon] = useState('caret-down');

    let rows = [];

    const moreToggle = () => {
        setShowDanceHistory(showDanceHistory === 'notshown' ? 'shown' : 'notshown');
        setMoreIcon(moreIcon === 'caret-down' ? 'caret-up' : 'caret-down');
    }

    const onerow = (h, i) => {
        const even_odd = i%2 === 0 ? 'even' : 'odd';
        return (
        <React.Fragment key={i}>
            <div className={"dc-who " + even_odd}>
                <div>
                    <div>{h.stateUser === SPECIAL_USER_SCANNER ? 'CalendarDance' : h.stateUser===props.userid ? 'You' : 'They'}</div>
                    <span className="tiny">as of {formatTs(h.stateDate._seconds)}</span>
                </div>
            </div>
            {(h.state === DANCE_STATE.PROPOSE || h.state === DANCE_STATE.INITIATE) &&
            <>
                <div className={"dc-for " + even_odd}>
                    {_t(lc, h.tfparams.activity, 'tc')}
                </div>
                <div className={"dc-when " + even_odd}>
                    {whenPhrase(lc, h.tftoken, h.tfparams)}
                </div>
            </>
            }
            {(h.state === DANCE_STATE.DEFER) &&
            <div className={"dc-forwhen " + even_odd}>
                Asked to defer for {_t(lc, h.deferral)}
            </div>
            }
            {(h.state === DANCE_STATE.ACCEPT) &&
            <div className={"dc-forwhen " + even_odd}>
                Accepted
            </div>
            }
            {(h.state === DANCE_STATE.PROPOSAL_ACCEPTED) &&
            <div className={"dc-forwhen " + even_odd}>
                Accepted alternative proposal
            </div>
            }
            {(h.state === DANCE_STATE.SNOOZE) &&
            <div className={"dc-forwhen " + even_odd}>
                Snoozing...
            </div>
            }
            {(h.state === DANCE_STATE.CHOOSE) &&
            <div className={"dc-forwhen " + even_odd}>
                Options have been proposed
            </div>
            }
        </React.Fragment>
        )
    };

    rows.push(onerow(props.history.slice(-1)[0], 0));
    if (props.history.length > 1) {
        rows.push(
            <React.Fragment key={1}>
                <div className={"dc-more-row"} onClick={moreToggle}>
                    <Icon icon={moreIcon}/>
                </div>
            </React.Fragment>
        )

        let collapseRows = [];
        props.history.slice().reverse().slice(1).map((h, j) => {
            collapseRows.push(onerow(h, j+1));
        });

        const collapse = <div className={"dc-dance-sub " + showDanceHistory} key={-1}>{collapseRows}</div>;
        rows.push(collapse);
    }

    return (
        <div className={"dc-dance"}>
            {rows}
        </div>
    )
});

const DanceList = React.memo(function DanceList(props) {
    console.log('DanceList render');
    const equal = (a, b) => a===b;
    const unequal = (a, b) => a!==b;
    const comparison = props.perspective === 'sender' ? equal : unequal;
    const whoseHandle = props.perspective === 'sender' ? 'recipient' : 'sender';
    const divStyle = {display: props.show?'grid':'none', marginLeft: '20px'};

    return (
        <div style={divStyle} className="dance-container">

            <div className={"dc-header dc-with"}>With</div>
            <div className={"dc-header dc-whatwhen"}>Details</div>
            <div className={"dc-header dc-action"}>Action</div>

            {((l)=>{return l.length>0?l:"None"})(props.activeDances
                .filter((dance) => {return comparison(dance.sender.userid, props.userid)})
                .map((dance, idx) => {
                    return (
                        <React.Fragment key={idx}>
                            <div className={"dc-with"}>
                                <div>
                                    <div>{dance[whoseHandle].handle}</div>
                                    <span className="tiny">{dance.recipient.email}</span>
                                </div>
                            </div>

                            <DanceHistory history={dance.history} userid={props.userid}/>

                            <div className={"dc-action"}>
                                <DanceActions dance={dance} {...props} />
                            </div>
                        </React.Fragment>
                    )
                }))
            }
        </div>
    )
}, propsCompare);

const DanceTable = React.memo((props) => {
    const [activeDances, setActiveDances] = useState([]);
    const [dancesOpen, setDancesOpen] = useState(false);
    const [startNewDance, setStartNewDance] = useState(false);
    const [recipientEmail, setRecipientEmail] = useState('');
    const [tftoken, setTftoken] = useState(undefined);
    const [activity, setActivity] = useState(undefined);
    const [time, setTime] = useState(undefined);
    const [tfparams, setTfparams] = useState({});
    const [enableDialogOK, setEnableDialogOK] = useState(false);
    const [showDancesIStarted, setShowDancesIStarted] = useState(false);
    const [showDancesTheyStarted, setShowDancesTheyStarted] = useState(false);
    const [postDanceCallback, setPostDanceCallback] = useState(undefined);
    const [queryProps, setQueryProps] = useState({});
    const [askForValue, setAskForValue] = useState(false);
    const [initialDanceParams, setInitialDanceParams] = useState(undefined);
    const [queryOptions, setQueryOptions] = useState([]);
    const [queryWhy, setQueryWhy] = useState('');

    const statecbs = React.useMemo(() => {
        return {
            setPostDanceCallback: setPostDanceCallback,
            setStartNewDance: setStartNewDance,
            setQueryProps: setQueryProps,
            setAskForValue: setAskForValue,
            setInitialDanceParams: setInitialDanceParams,
            setRecipientEmail: setRecipientEmail
        }
    }, []);

    const QueryValue = (props) => {
        // When we ask the user to make a selection, sometimes it will be a single selection, and
        // sometimes we'll allow multi-select. We use the state values querySelectionSingle and
        // querySelectionsMultiple for those cases, respectively. When the user clicks OK to
        // confirm their selection, we pass to the callback a merge of these two state values.
        // The cases are:
        //                    querySelectionSingle    querySelectionsMultiple    Merged Result
        //   ---------------------------------------------------------------------------------
        //   SINGLE SELECT         value                  []                     [value]
        //   MULTI-SELECT            ''                   [v1, v2, ...]          [v1, v2, ..., '']
        //
        // Note that the merged result when it's a multi-select contains an empty string: ''. We
        // filter that out. (See expression below in call to callback.)
        //
        // Why pass an array to the callback when we're doing a single select? Just to make the
        // code easier to write. The backend will then always get an array from a frontend CHOICE,
        // regardless of single select or multi-select.

        const [querySelectionsMultiple, setQuerySelectionsMultiple] = useState([]);
        const [querySelectionSingle, setQuerySelectionSingle] = useState('');

        useEffect(() => {
            if (props.options) {
                const options = typeof(props.options) === 'function' ? props.options(props.docid) : props.options;
                setQueryOptions(options);
                setQueryWhy(props.why);
            }
        }, [props]);

        // See https://jsfiddle.net/KyleMit/mqcp7f3s/ for how to use checkboxes in multi-select

        return (
            <Dialog isOpen={askForValue} style={{width: 'auto', display:'inline'}}>
                <div className="bp3-dialog-header">{props.title}</div>
                <Card interactive={true} elevation={Elevation.FOUR}>
                    <div>{props.prompt}</div>
                    {props.selectStyle === SELECTSTYLE_MULTI &&
                    <select multiple className={'select-checkbox'} value={querySelectionsMultiple} readOnly
                            onMouseDown={(e) => {
                            e.preventDefault();
                            const val = e.target.value;
                            let qcopy = querySelectionsMultiple.splice(0);

                            if (e.target.selected) {
                                qcopy.splice(qcopy.indexOf(val), 1);
                            }
                            else {
                                qcopy.push(val);
                            }
                            setQuerySelectionsMultiple(qcopy);
                            e.target.selected = ! e.target.selected;
                        }}
                    >
                        {queryOptions.map((o, i) => {return <option value={o.v} key={i}>{o.t}</option>})}
                    </select>
                    }
                    {props.selectStyle === SELECTSTYLE_SINGLE &&
                    <select defaultValue={querySelectionSingle}
                            onChange={(e) => setQuerySelectionSingle(e.target.value)}
                    >
                        {queryOptions.map((o, i) => {return <option value={o.v} key={i}>{o.t}</option>})}
                    </select>
                    }
                    {props.selectStyle === SELECTSTYLE_GRID && queryOptions.length > 0 &&
                        <TimeSlotGrid options={queryOptions} docid={props.docid}></TimeSlotGrid>
                    }
                </Card>
                <div style={{marginLeft: '20px'}}>
                    <Button onClick={() => {setAskForValue(false); props.callback(null)}}
                            type="button"
                            size="medium"
                            className="calendardance-button-sm"
                            intent="secondary"
                            style={{maxWidth: '20%', minWidth: '20%'}}
                    >
                    Cancel
                    </Button>
                    <Button onClick={() => {setAskForValue(false); props.callback([...querySelectionsMultiple, ...[querySelectionSingle]].filter((v)=>v!==''))}}
                            type="button"
                            size="medium"
                            className="calendardance-button-sm"
                            intent="primary"
                            style={{maxWidth: '20%', minWidth: '20%', marginLeft: '1em'}}
                    >
                        OK
                    </Button>
                </div>
            </Dialog>
        )
    };

    useEffect(() => {
        if (recipientEmail && tftoken && activity) {
            setEnableDialogOK(true);
        }
    }, [recipientEmail, tftoken, activity]);

    const reportDanceParams = (who, value) => {
        parseDanceParams(value);
    };

    const parseDanceParams = (newdata) => {
        let newTfparams = {};
        let newtoken = undefined;

        const segments = newdata.split(';');
        for (const segment of segments) {
            const [key, value] = segment.split(':');
            if (key === 'token') {
                newtoken = value.split('=')[0];
            }
            else if (key === 'tfparam') {
                let [param, paramval] = value.split('=');

                // Handle complex case in which param looks like range.ONEWEEK=true or range.month=8
                // When value is true, actual value we send is the string after the dot, e.g., ONEWEEK.
                // Otherwise, send the value.
                if (param.startsWith('range.')) {
                    if (paramval === 'true') {
                        paramval = param.slice(6); // expression after the dot
                    }
                    param = 'range';
                }

                newTfparams[param] = paramval;
            }
        }

        // activity and time come in as tfparams, but we set them separately in component state
        if (newTfparams.activity) {
            setActivity(newTfparams.activity);
            delete newTfparams.activity;
        }

        if (newTfparams.time) {
            setTime(newTfparams.time);
            delete newTfparams.time;
        }

        if (Object.keys(newTfparams).length > 0) {
            setTfparams(newTfparams);
        }

        if (newtoken) {
            setTftoken(newtoken);
        }
    };

    const getDances = async () => {
        props.statusMessage(true, 'Refreshing dance data...');
        const response = await fetch(
            props.constants.BACKEND + '/dance/s/poll/rs',
            {
                credentials: 'include',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        props.statusMessage(false);
        const responseJSON = await response.json();

        if (responseJSON.OK) {
            let dances = [];

            for (const dance of responseJSON.data) {
                dances.push(dance);
            }

            setActiveDances(dances);
        }
        else {
            // TODO: Handle dance retrieval error
        }
    };

    const newDance = async (userCancelled) => {
        let body;

        // FIXME: We're still posting to the backend when user hits Cancel??
        if (userCancelled) {
            body = null;
        }
        else {
            // Put activity and/or time in with other tfparams
            let tfparamsToSend = Object.assign(tfparams, {});
            tfparamsToSend.activity = activity;
            if (time) {
                tfparamsToSend.time = time;
            }

            body = {
                recipientEmail: recipientEmail,
                tftoken: tftoken,
                tfparams: tfparamsToSend,
            };
        }

        if (postDanceCallback) {
            postDanceCallback(body);
            return;
        }

        props.statusMessage(true, 'Saving dance data...');

        const response = await fetch(
            props.constants.BACKEND + '/dance/s/initiate',
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        props.statusMessage(false);

        const responseJSON = await response.json();
        if (responseJSON.OK) {
            await getDances();
            // Clear out last-used values
            setRecipientEmail(undefined);
            setTftoken(undefined);
            setTfparams({});
            setActivity(undefined);
            setTime(undefined);
        }
        else {
                // TODO: Handle dance initiation error
        }
    };

    const alterDance = async (route, payload) => {
        const response = await fetch(
            route,
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );

        const responseJSON = await response.json();
        if (responseJSON.OK) {
            props.statusMessage(true, 'Data saved');
            await getDances();
        }
        else {
            // TODO: Handle action POST failure
            props.statusMessage(false);
        }
    };

    return (
        <>
            <>
                <Button
                    type="button"
                    className="calendardance-button-sm"
                    intent="primary"
                    onClick={() => {setDancesOpen(!dancesOpen)}}
                    style={{width: '20%'}}
                >
                    {dancesOpen ? 'Hide' : 'Show'} my Dances
                </Button>
                <Collapse isOpen={dancesOpen} keepChildrenMounted={true}>
                    <div style={{marginLeft:'50%'}}>
                        <Button
                            type="button"
                            className="calendardance-button-sm"
                            intent="primary"
                            onClick={() => {setStartNewDance(!startNewDance)}}
                            style={{width: '30%'}}
                        >
                            Start a Dance
                        </Button>
                        <Button
                            type="button"
                            className="calendardance-button-sm"
                            intent="primary"
                            onClick={getDances}
                            style={{width: '30%', marginLeft: '1%'}}
                        >
                            Refresh Dance data
                        </Button>
                    </div>
                    <>
                        {activeDances.length === 0 &&
                        <div>
                            No data...try clicking <em>Refresh dance data</em>
                        </div>
                        }
                        {activeDances.length > 0 &&
                        <>
                            <div className={"dance-header-category"} style={{marginTop: '1em'}}>
                                <Icon
                                    icon={showDancesIStarted ? "caret-down" : "caret-right"}
                                    iconSize="20"
                                    onClick={()=> {setShowDancesIStarted(!showDancesIStarted)}}
                                />
                                <span>Dances I started</span>
                            </div>
                            <DanceList
                                {...props}
                                perspective={'sender'}
                                show={showDancesIStarted}
                                activeDances={activeDances}
                                userid={props.user.userData.userid}
                                statecbs={statecbs}
                                className="dance-container"
                                alterDance = {alterDance}
                            />
                            <div className={"dance-header-category"} style={{marginTop: '1em'}}>
                                <Icon
                                    icon={showDancesTheyStarted ? "caret-down" : "caret-right"}
                                    iconSize="20"
                                    onClick={()=> {setShowDancesTheyStarted(!showDancesTheyStarted)}}
                                />
                                <span>Dances they started</span>
                            </div>
                            <DanceList
                                {...props}
                                perspective={'recipient'}
                                show={showDancesTheyStarted}
                                activeDances={activeDances}
                                userid={props.user.userData.userid}
                                statecbs={statecbs}
                                className="dance-container"
                                alterDance={alterDance}
                            />
                        </>
                        }
                    </>
                </Collapse>
            </>

            <Dialog isOpen={startNewDance} style={{width: '60%'}}>
                <div className="bp3-dialog-header">Start a dance</div>
                <Card interactive={true} elevation={Elevation.FOUR}>
                    <InputGroup
                        large
                        leftIcon="asterisk"
                        placeholder="Email of other person"
                        value={recipientEmail}
                        onChange={event => setRecipientEmail(event.target.value)}
                    />
                </Card>
                <table className="bp3-html-table" style={{width: '100%'}}>
                    <thead>
                    </thead>
                    <tbody>
                    <tr style={{backgroundColor: 'papayawhip'}}>
                        <td colSpan={"2"}>
                            <p className="table-instructions">Complete one of these sections...
                                <Icon icon={"hand-down"} style={{marginLeft: '1em'}} />
                            </p>
                        </td>
                    </tr>
                    <MutexControlGroup pool={true} name="root" enforceMutex={false} reportDanceParams={reportDanceParams} initialDanceParams={initialDanceParams}>
                    <MutexControlGroup pool={true} name={"whenpool"}>
                        <tr>
                            <MutexControlGroup pool={true} name={"pool1"}>
                            <td style={{borderRight: 'solid', borderBottom: 'solid', textAlign: 'center'}}>
                                <MutexControlGroup name="p1.1">
                                    <ButtonGroup className="bp3-vertical">
                                        <Button mcg={"token:"+TFTOKEN.TODAY}>{_t(lc, TFTOKEN.TODAY, 'tc')}</Button>
                                        <Button mcg={"token:"+TFTOKEN.TOMORROW}>{_t(lc, TFTOKEN.TOMORROW, 'tc')}</Button>
                                        <Button mcg={"token:"+TFTOKEN.WEEKEND}>{_t(lc, TFTOKEN.WEEKEND, 'tc')}</Button>
                                    </ButtonGroup>
                                </MutexControlGroup>
                            </td>

                            <td style={{verticalAlign: 'middle', textAlign: 'center', borderRight: 'solid', borderBottom: 'solid'}}>
                                <MutexControlGroup name="p1.2" enforceMutex={false}>
                                    <Button mcg={"token:"+TFTOKEN.DOW+";tfparam:nextflag"}>{_t(lc, 'nextflag', 'tc')}</Button>
                                    <div className="bp3-select" style={{verticalAlign:'unset', marginLeft:'2em'}}>
                                        <select mcg={"token:"+TFTOKEN.DOW+";tfparam:day"}>
                                            <option value={-1}>{_t(lc, 'day', 'tc')}</option>
                                            <option value={TFDAY.SUN}>{_t(lc, 'd'+TFDAY.SUN)}</option>
                                            <option value={TFDAY.MON}>{_t(lc, 'd'+TFDAY.MON)}</option>
                                            <option value={TFDAY.TUE}>{_t(lc, 'd'+TFDAY.TUE)}</option>
                                            <option value={TFDAY.WED}>{_t(lc, 'd'+TFDAY.WED)}</option>
                                            <option value={TFDAY.THU}>{_t(lc, 'd'+TFDAY.THU)}</option>
                                            <option value={TFDAY.FRI}>{_t(lc, 'd'+TFDAY.FRI)}</option>
                                            <option value={TFDAY.SAT}>{_t(lc, 'd'+TFDAY.SAT)}</option>
                                        </select>
                                    </div>
                                </MutexControlGroup>
                            </td>
                            </MutexControlGroup>
                        </tr>
                        <tr>
                            <td colSpan="2" style={{
                                verticalAlign: 'middle',
                                textAlign: 'center',
                                borderRight: 'solid',
                                borderBottom: 'solid'
                            }}>
                                <MutexControlGroup pool={true} name={"pool2"} enforceMutex={false}>
                                    <MutexControlGroup name="p2.1" enforceMutex={false}>
                                        <div className="bp3-select" style={{verticalAlign:'text-bottom', width: '30%'}}>
                                            <select mcg={"token:"+TFTOKEN.THIS+";tfparam:narrower"}>
                                                <option value={-1}>{_t(lc, 'when', 'tc')}</option>
                                                <option value={TFNARROWER.EARLY}>{_t(lc, TFNARROWER.EARLY, 'tc')}</option>
                                                <option value={TFNARROWER.MIDDLE}>{_t(lc, TFNARROWER.MIDDLE, 'tc')}</option>
                                                <option value={TFNARROWER.ENDOF}>{_t(lc, TFNARROWER.ENDOF, 'tc')}</option>
                                            </select>
                                        </div>
                                    </MutexControlGroup>
                                    <MutexControlGroup name="p2.2">
                                        <ButtonGroup
                                            className="bp3-vertical"
                                            style={{width: '30%', marginLeft: '2em'}}
                                        >
                                            <Button mcg={"token:"+TFTOKEN.THIS+";tfparam:range.THISWEEK"}>{_t(lc, TFRANGE.THISWEEK, 'tc')}</Button>
                                            <Button mcg={"token:"+TFTOKEN.THIS+";tfparam:range.THISMONTH"}>{_t(lc, TFRANGE.THISMONTH, 'tc')}</Button>
                                        </ButtonGroup>
                                    </MutexControlGroup>
                                    <MutexControlGroup name="p2.3" enforceMutex={false}>
                                        <div style={{display: 'inline-block', width: '30%'}}>
                                            <Checkbox mcg={"token:"+TFTOKEN.THIS+";tfparam:weekdaysPreferred"}>{_t(lc, 'weekdaysPreferred', 'tc')}</Checkbox>
                                            <Checkbox mcg={"token:"+TFTOKEN.THIS+";tfparam:weekendsPreferred"}>{_t(lc, 'weekendsPreferred', 'tc')}</Checkbox>
                                        </div>
                                    </MutexControlGroup>
                                </MutexControlGroup>
                            </td>
                        </tr>
                        <tr>
                            <td colSpan="2" style={{
                                verticalAlign: 'middle',
                                textAlign: 'center',
                                borderRight: 'solid',
                                borderBottom: 'solid'
                            }}>
                                <div style={{
                                    verticalAlign:'middle',
                                    display: 'inline-block',
                                    width: '30%',
                                    fontSize: 'large'
                                }}>
                                    {_t(lc, TFTOKEN.WITHIN, 'tc')}
                                </div>
                                <MutexControlGroup pool={true} name={"pool3"} enforceMutex={false}>
                                    <MutexControlGroup name={"p3.1"}>
                                        <ButtonGroup
                                            className="bp3-vertical"
                                            style={{width: '30%', marginLeft: '2em'}}
                                        >
                                            <Button mcg={"token:"+TFTOKEN.WITHIN+";tfparam:range.ONEWEEK"}>{_t(lc, 'ONEWEEK', 'tc')}</Button>
                                            <Button mcg={"token:"+TFTOKEN.WITHIN+";tfparam:range.TWOWEEKS"}>{_t(lc, 'TWOWEEKS', 'tc')}</Button>
                                            <Button mcg={"token:"+TFTOKEN.WITHIN+";tfparam:range.ONEMONTH"}>{_t(lc, 'ONEMONTH', 'tc')}</Button>
                                        </ButtonGroup>
                                    </MutexControlGroup>
                                    <MutexControlGroup name="pool3.2" enforceMutex={false}>
                                        <div style={{display: 'inline-block', width: '30%', marginTop: '1em'}}>
                                            <Checkbox mcg={"token:"+TFTOKEN.WITHIN+";tfparam:weekdaysPreferred"}>{_t(lc, 'weekdaysPreferred', 'tc')}</Checkbox>
                                            <Checkbox mcg={"token:"+TFTOKEN.WITHIN+";tfparam:weekendsPreferred"}>{_t(lc, 'weekendsPreferred', 'tc')}</Checkbox>
                                        </div>
                                    </MutexControlGroup>
                                </MutexControlGroup>
                            </td>
                        </tr>
                        <tr>
                            <td colSpan="2" style={{
                                verticalAlign: 'middle',
                                textAlign: 'center',
                                borderRight: 'solid',
                                borderBottom: 'solid'
                            }}>
                                <div style={{
                                    verticalAlign:'middle',
                                    display: 'inline-block',
                                    width: '30%',
                                    fontSize: 'large'
                                }}>
                                    {_t(lc, TFTOKEN.BEFOREEND, 'tc')}
                                </div>
                                <MutexControlGroup pool={true} name={"pool4"} enforceMutex={false}>
                                    <MutexControlGroup name="p4.1">
                                        <ButtonGroup
                                            className="bp3-vertical"
                                            style={{width: '30%', marginLeft: '2em'}}
                                        >
                                            <Button mcg={"token:"+TFTOKEN.BEFOREEND+";tfparam:range.THEMONTH"}>{_t(lc, 'THEMONTH', 'tc')}</Button>
                                            <div className="bp3-select" style={{verticalAlign:'text-bottom', width: '100%', marginTop: '1em'}}>
                                                <select mcg={"token:"+TFTOKEN.BEFOREEND+";tfparam:range.month"}>
                                                    <option value={-1}>{_t(lc, 'month', 'tc')}</option>
                                                    <option value={"month#"+TFMONTH.JAN}>{_t(lc, "month#"+TFMONTH.JAN)}</option>
                                                    <option value={"month#"+TFMONTH.FEB}>{_t(lc, "month#"+TFMONTH.FEB)}</option>
                                                    <option value={"month#"+TFMONTH.MAR}>{_t(lc, "month#"+TFMONTH.MAR)}</option>
                                                    <option value={"month#"+TFMONTH.APR}>{_t(lc, "month#"+TFMONTH.APR)}</option>
                                                    <option value={"month#"+TFMONTH.MAY}>{_t(lc, "month#"+TFMONTH.MAY)}</option>
                                                    <option value={"month#"+TFMONTH.JUN}>{_t(lc, "month#"+TFMONTH.JUN)}</option>
                                                    <option value={"month#"+TFMONTH.JUL}>{_t(lc, "month#"+TFMONTH.JUL)}</option>
                                                    <option value={"month#"+TFMONTH.AUG}>{_t(lc, "month#"+TFMONTH.AUG)}</option>
                                                    <option value={"month#"+TFMONTH.SEP}>{_t(lc, "month#"+TFMONTH.SEP)}</option>
                                                    <option value={"month#"+TFMONTH.OCT}>{_t(lc, "month#"+TFMONTH.OCT)}</option>
                                                    <option value={"month#"+TFMONTH.NOV}>{_t(lc, "month#"+TFMONTH.NOV)}</option>
                                                    <option value={"month#"+TFMONTH.DEC}>{_t(lc, "month#"+TFMONTH.DEC)}</option>
                                                </select>
                                            </div>
                                            <div className="bp3-select" style={{verticalAlign:'text-bottom', width: '100%', marginTop: '.5em'}}>
                                                <select mcg={"token:"+TFTOKEN.BEFOREEND+";tfparam:range.season"}>
                                                    <option value={-1}>{_t(lc, 'season', 'tc')}</option>
                                                    <option value={"season#"+TFSEASON.SPRING}>{_t(lc, "season#"+TFSEASON.SPRING, 'tc')}</option>
                                                    <option value={"season#"+TFSEASON.SUMMER}>{_t(lc, "season#"+TFSEASON.SUMMER, 'tc')}</option>
                                                    <option value={"season#"+TFSEASON.FALL}>{_t(lc, "season#"+TFSEASON.FALL, 'tc')}</option>
                                                    <option value={"season#"+TFSEASON.WINTER}>{_t(lc, "season#"+TFSEASON.WINTER, 'tc')}</option>
                                                </select>
                                            </div>
                                        </ButtonGroup>
                                    </MutexControlGroup>
                                    <MutexControlGroup name="p4.2" enforceMutex={false}>
                                        <div style={{display: 'inline-block', width: '30%', marginTop: '1.5em'}}>
                                            <Checkbox mcg={"token:"+TFTOKEN.BEFOREEND+";tfparam:weekdaysPreferred"}>{_t(lc, 'weekdaysPreferred', 'tc')}</Checkbox>
                                            <Checkbox mcg={"token:"+TFTOKEN.BEFOREEND+";tfparam:weekendsPreferred"}>{_t(lc, 'weekendsPreferred', 'tc')}</Checkbox>
                                        </div>
                                    </MutexControlGroup>
                                </MutexControlGroup>
                            </td>
                        </tr>
                    </MutexControlGroup>
                        <tr style={{backgroundColor: 'papayawhip'}}>
                            <td colSpan={"2"}>
                                <p className="table-instructions">...and complete this section
                                    <Icon icon={"hand-down"} style={{marginLeft: '1em'}} />
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td colSpan="2" style={{verticalAlign: 'middle', borderRight: 'solid', borderBottom: 'solid', textAlign: '-webkit-center'}}>
                                <MutexControlGroup name="whypool" pool={true} enforceMutex={false}>
                                    <MutexControlGroup name="whydetails" enforceMutex={false}>
                                        <div>
                                        <Label style={{display:'inline-block', minWidth:'20%'}}>Reason</Label>
                                        <div className="bp3-select"
                                             style={{verticalAlign:'middle', display: 'inline-block', width:'50%'}}>
                                            <select mcg="tfparam:activity">
                                                <option value={-1}>{_t(lc, 'plan', 'tc')}</option>
                                                <option value={TFACTIVITY.COFFEE}>{_t(lc, TFACTIVITY.COFFEE, 'tc')}</option>
                                                <option value={TFACTIVITY.BREAKFAST}>{_t(lc, TFACTIVITY.BREAKFAST, 'tc')}</option>
                                                <option value={TFACTIVITY.LUNCH}>{_t(lc, TFACTIVITY.LUNCH, 'tc')}</option>
                                                <option value={TFACTIVITY.DINNERDRINKS}>{_t(lc, TFACTIVITY.DINNERDRINKS, 'tc')}</option>
                                                <option value={TFACTIVITY.CONVERSATION}>{_t(lc, TFACTIVITY.CONVERSATION, 'tc')}</option>
                                                <option value={TFACTIVITY.MEETING}>{_t(lc, TFACTIVITY.MEETING, 'tc')}</option>
                                                <option value={TFACTIVITY.FUN}>{_t(lc, TFACTIVITY.FUN, 'tc')}</option>
                                                <option value={TFACTIVITY.WHATEVER}>{_t(lc, TFACTIVITY.WHATEVER, 'tc')}</option>
                                            </select>
                                        </div>
                                        </div>
                                        <div>
                                        <Label style={{display:'inline-block', minWidth:'20%'}}>Time (optional)</Label>
                                        <div className="bp3-select" style={{verticalAlign:'middle', display: 'inline-block', width:'50%'}}>
                                            <select mcg="tfparam:time">
                                                <option value={-1}>{_t(lc, 'time', 'tc')}</option>
                                                <option value={TFTIME.MORNING}>{_t(lc, TFTIME.MORNING, 'tc')}</option>
                                                <option value={TFTIME.MIDDAY}>{_t(lc, TFTIME.MIDDAY, 'tc')}</option>
                                                <option value={TFTIME.AFTERNOON}>{_t(lc, TFTIME.AFTERNOON, 'tc')}</option>
                                                <option value={TFTIME.AFTERWORK}>{_t(lc, TFTIME.AFTERWORK, 'tc')}</option>
                                                <option value={TFTIME.ATNIGHT}>{_t(lc, TFTIME.ATNIGHT, 'tc')}</option>
                                            </select>
                                        </div>
                                        </div>
                                    </MutexControlGroup>
                                </MutexControlGroup>
                            </td>
                        </tr>
                    </MutexControlGroup>
                    <tr>
                        <td colSpan={"2"} style={{textAlign: 'center'}}>
                            <Button onClick={() => {setStartNewDance(false); newDance(true)}}
                                    type="button"
                                    size="medium"
                                    className="calendardance-button"
                                    intent="secondary"
                                    style={{maxWidth: '20%', minWidth: '20%'}}
                            >
                                Cancel
                            </Button>
                            <Button onClick={() => {setStartNewDance(false); newDance(false)}}
                                    type="button"
                                    size="medium"
                                    className="calendardance-button"
                                    intent="primary"
                                    disabled={!enableDialogOK}
                                    style={{maxWidth: '20%', minWidth: '20%', marginLeft: '1em'}}
                            >
                                OK
                            </Button>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </Dialog>
            <QueryValue {...queryProps} />
        </>
    )
});

export default DanceTable;
