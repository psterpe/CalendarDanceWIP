import React, {useState, useEffect, useCallback} from 'react';
import {Button, Checkbox} from '@blueprintjs/core';

export const MutexControlGroup = React.memo(function MutexControlGroup(props) {
    const [members, setMembers] = useState({});
    const [mcgBody, setMcgBody] = useState([]);
    const [render, setRender] = useState(0);
    const [registered, setRegistered] = useState(false);

    const enforceMutex = props.enforceMutex !== false;

    const iampool = props.pool === true;
    const poolRegisterProp = props.poolRegister;
    const poolReportProp = props.poolReport;

    let changeQueue = [];
    const qtimeout = 100;

    const overallState = () => {
        let mystate = [];

        for (const k of Object.keys(members)) {
            if (members[k].isOn(members[k].value)) {
                if (iampool) {
                    mystate.push(members[k].value);
                }
                else {
                    mystate.push(`${k}=${members[k].value}`);
                }
            }
        }

        return mystate.length === 0 ? '' : mystate.join(';');
    };

    const setMembersWrapper = (mems, reportUp=true) => {
        setMembers(mems);

        if (reportUp && poolReportProp) {
            poolReportProp(props.name, overallState());
        }

        setRender(new Date().getTime());
    };

    const turnOthersOff = (notthisone) => {
        let mems = Object.assign(members, {});
        Object.keys(mems).forEach((key) => {
            if (key !== notthisone) {
                mems[key].offFunc(key);
            }
        });
        };

    const setMember = (mcg, value) => {
        if (members[mcg].value !== value) {
            changeQueue.push([mcg, value]);
        }
    };

    const recursiveMap = useCallback((children, initialDanceParams, fn) => {
        const poolReport = (mcgname, valuestring) => {
            if (props.name === 'root' && props.reportDanceParams) {
                props.reportDanceParams(props.name, valuestring);
            }

            if (members[mcgname].value !== valuestring) {
                setMember(mcgname, valuestring);
            }
        };

        const poolRegister = (mcgname, offFunc, isOnFunc) => {
            if (members[mcgname]) {
                return;
            }
            let mems = Object.assign(members, {});
            mems[mcgname] = {offFunc: offFunc, value: '', isOn: isOnFunc};
            setMembers(mems);
        };

        return React.Children.map(children, child => {
            if (!React.isValidElement(child)) {
                return child;
            }

            if (iampool && typeof(child) === 'object' && child.type.type && child.type.type.name === 'MutexControlGroup') {
                child = React.cloneElement(child, {
                    poolRegister: poolRegister,
                    poolReport: poolReport,
                    initialDanceParams: initialDanceParams
                });
                return child;
            }

            if (child.props.children) {
                child = React.cloneElement(child, {
                    children: recursiveMap(child.props.children, initialDanceParams, fn)
                });
            }

            return fn(child);
        });
    }, [iampool, members]);

    useEffect(() => {
        const turnAllOff = () => {
            let mems = Object.assign(members, {});
            Object.keys(mems).forEach((key) => {
                mems[key].offFunc(key);
            });
        };

        const isOn = () => {
            return overallState();
        };

        if (poolRegisterProp && !registered) {
            poolRegisterProp(props.name, turnAllOff, isOn);
            setRegistered(true);
        }

        const addMember = (mcg, isOnFunc, initVal, offFunc) => {
            if (members[mcg]) {
                return;
            }

            let mems = Object.assign(members, {});
            mems[mcg] = {value: initVal, isOn: isOnFunc, offFunc: offFunc};
            setMembersWrapper(mems);
        };

        const turnOffButton = (mcg) => {
            setMember(mcg, false);
        };

        const turnOffSelect = (mcg) => {
            setMember(mcg, '-1');
        };

        const turnOffCheckbox = (mcg) => {
            setMember(mcg, false);
        };

        const toggleButton = (mcg) => {
            // Only makes sense for toggle-capable elements, e.g., our special indicator button.
            // A <select> can't be toggled -- what would we set it to when turning it on?

            const oppositeValue = !members[mcg].value;
            setMember(mcg, oppositeValue);
        };

        const buttonHandler = (e, mcg, currentHandler) => {
            changeQueue = [];
            toggleButton(mcg);

            if (currentHandler) {
                currentHandler(e);
            }
        };

        const selectHandler = (e, mcg, currentHandler) => {
            changeQueue = [];
            setMember(mcg, (e.currentTarget.value));

            if (currentHandler) {
                currentHandler(e);
            }
        };

        const checkboxHandler = (e, mcg, currentHandler) => {
            changeQueue = [];
            setMember(mcg, (e.currentTarget.checked));

            if (currentHandler) {
                currentHandler(e);
            }
        };

        const vlookup = (mcg) => {
            return members[mcg].value;
        };

        const clookup = (mcg) => {
            return members[mcg].isOn(members[mcg].value) ? 'cd-indicator-on' : 'cd-indicator-off';
        };

        const cblookup = (mcg) => {
            return members[mcg].value;
        };

        const applyQueuedChanges = () => {
            let mems = Object.assign(members, {});
            for (const change of changeQueue) {
                const key = change[0];
                mems[key].value = change[1];
            }
            return mems;
        };

        const processQueue = () => {
            if (changeQueue.length === 0) {
                setTimeout(processQueue, qtimeout);
            }
            else {
                // If head of queue represents an "on" value and we need mutex, turn off others
                const queuehead = changeQueue[0];
                if (members[queuehead[0]].isOn(queuehead[1]) && enforceMutex) {
                    turnOthersOff(queuehead[0]);
                }
                setMembersWrapper(applyQueuedChanges());
                changeQueue = [];
                setTimeout(processQueue, qtimeout);
            }
        };

        const setMe = (kind, name, params) => {
            if (params === undefined) {
                return undefined;
            }

            // Look in name for what follows tfparam: and token: -- at least one of those will be present
            const re = /(token:([A-Z|]+);?)?(tfparam:(.+))?/;
            const result = name.match(re);
            const tftoken = result[2];
            const tfparam = result[4];

            let match_tfparam = undefined;
            let match_tftoken = undefined;
            let match = undefined;

            // Cases:
            //  a) the element specifies both tftoken and tfparam -- match on both
            //  b) the element specifies only tftoken or only tfparam -- match on that
            debugger;
            if (tfparam) {
                // Handle special case of tfparam of the form range.zzz. It's not enough for the
                // params.tfparams to contain a 'range' prop; the value of that prop must also match.
                if (tfparam.startsWith('range.') && params.tfparams.range) {
                    const rangeDetail = tfparam.slice(6);
                    if ((rangeDetail === 'month' && params.tfparams.range.startsWith('month#')) ||
                        (rangeDetail === 'season' && params.tfparams.range.startsWith('season#'))) {
                        match_tfparam = params.tfparams.range;
                    }
                    else if (rangeDetail === params.tfparams.range) {
                        match_tfparam = params.tfparams.range;
                    }
                }
                else if (params.tfparams[tfparam]) {
                    match_tfparam = params.tfparams[tfparam];
                }
            }

            if (tftoken) {
                // Using indexOf because tftoken could be of the form THISWEEK|THISMONTH
                match_tftoken = tftoken.indexOf(params.tftoken) !== -1;
            }

            if (!match_tfparam && !match_tftoken) {
                return undefined;
            }

            if (tftoken && tfparam) {
                if (match_tftoken && match_tfparam) {
                    // If name has both token and tfparam parts, the tfparam contains the interesting value
                    match = match_tfparam;
                }
                else {
                    return undefined;
                }
            }
            else if (tftoken) {
                match = match_tftoken;
            }
            else {
                match = match_tfparam;
            }

            if (!match) {
                return undefined;
            }
            else {
                return (kind === 'button' || kind === 'checkbox') ? true : match;
            }
        };

        const x = recursiveMap(props.children, props.initialDanceParams, (child) => {
            if (child.props.mcg) {

                let currentHandler;
                let handler;
                let element;

                if (child.type.name === 'Button') {
                    addMember(child.props.mcg, (v) => {
                        return v === true
                    }, setMe('button', child.props.mcg, props.initialDanceParams) || false, turnOffButton);
                    currentHandler = child.props.onClick;
                    handler = buttonHandler;
                    element =
                        <Button
                            onClick={(e) => {
                                handler(e, child.props.mcg, currentHandler)
                            }}
                            className={clookup(child.props.mcg)}
                        >
                            {child.props.children}
                        </Button>;
                } else if (child.type === 'select') {
                    addMember(child.props.mcg, (v) => {
                        return v !== '-1'
                    }, setMe('select', child.props.mcg, props.initialDanceParams) || '-1', turnOffSelect);
                    currentHandler = child.props.onChange;
                    handler = selectHandler;
                    element =
                        <select
                            onChange={(e) => {
                                handler(e, child.props.mcg, currentHandler)
                            }}
                            value={vlookup(child.props.mcg)}
                            className={clookup(child.props.mcg)}
                        >
                            {child.props.children}
                        </select>;
                } else if (child.type.name === 'Checkbox') {
                    addMember(child.props.mcg, (v) => {
                        return v === true
                    }, setMe('checkbox', child.props.mcg, props.initialDanceParams) || false, turnOffCheckbox);
                    currentHandler = child.props.onChange;
                    handler = checkboxHandler;
                    element =
                        <Checkbox
                            onChange={(e) => {
                                handler(e, child.props.mcg, currentHandler)
                            }}
                            checked={cblookup(child.props.mcg)}
                        >
                            {child.props.children}
                        </Checkbox>;
                }

                return element;
            } else {
                return child;
            }
        });
        setMcgBody(x);


        // Start changeQueue timer
        setTimeout(processQueue, qtimeout);
    }, [recursiveMap, props.children, props.name, members, render, enforceMutex, poolRegisterProp]);

    return (
        <>
            {mcgBody}
        </>
    )
});
