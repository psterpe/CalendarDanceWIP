import React, {useState, useEffect} from 'react';
import * as qs from 'query-string';
import {Button, InputGroup, Card, Elevation, Collapse} from '@blueprintjs/core';
import Container from '@material-ui/core/Container';
import Snackbar from '@material-ui/core/Snackbar';
import IconButton from '@material-ui/core/IconButton';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import CloseIcon from '@material-ui/icons/Close';
import Header from './header';
import DanceTable from './dancetable';
import {formatTs} from '../translate';
import SlotMapGraph from './slotmapgraph';

export default function Home(props) {
    const [sessionExpired, setSessionExpired] = useState(false);
    const [fetchingData, setFetchingData] = useState(false);
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [currentAuthData, setCurrentAuthData] = useState({});
    const [authNeeded, setAuthNeeded] = useState(false);
    const [appSpecificPassword, setAppSpecificPassword] = useState('');
    const [calendarAccountEmail, setCalendarAccountEmail] = useState('');
    const [calendarsInUse, setCalendarsInUse] = useState({});
    const [retryCounter, setRetryCounter] = useState(0);
    const [slotmapData, setSlotmapData] = useState({});
    const [freebusyOpen, setFreebusyOpen] = useState(false);

    useEffect(() => {
        document.title = 'CalendarDance';

        const parsedQs = qs.parse(props.location.search);
        if (parsedQs.auth === 'OK') {
            setSnackbarMessage('Permission obtained -- Thanks. Try again.');
            setSnackbarOpen(true);
        }

        const getCalendarsInUse = async (userid) => {
            setFetchingData(true);
            const response = await fetch(
                props.constants.BACKEND + `/user/s/calendar`,
                {
                    credentials: 'include',
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const responseJSON = await response.json();

            if (responseJSON.OK) {
                let calsInUse = Object.assign({}, calendarsInUse);

                // If empty, seed it with the major providers
                if (Object.keys(calsInUse).length === 0) {
                    calsInUse['Google'] = [];
                    calsInUse['Microsoft'] = [];
                    calsInUse['Apple'] = [];
                }

                for (const ical of responseJSON.data) {
                    // Add flag so UI knows we're really using this calendar
                    ical['inUse'] = true;
                    try {
                        calsInUse[ical.provider].push(ical);
                    }
                    catch {
                        calsInUse[ical.provider] = [ical];
                    }
                }

                setCalendarsInUse(calsInUse);
                setFetchingData(false);
            }
            else {
                setSnackbarMessage('Something went wrong retrieving calendar data.')
                setSnackbarOpen(true);
            }
        };

        if (props.session.status && Object.keys(calendarsInUse).length === 0) {
            getCalendarsInUse(props.session.userid);
        }
    }, [
        calendarsInUse,
        props.constants.BACKEND,
        props.session.status,
        props.session.userid,
        props.location.search
    ]);

    const getProviderCalendars = async (provider) => {
        setSnackbarMessage(`Fetching data from ${provider}...`);
        setSnackbarOpen(true);

        const response = await fetch(
            props.constants.BACKEND + `/user/s/calendar/${provider}`,
            {
                credentials: 'include',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        const responseJSON = await response.json();
        closeSnackbar();

        // Do we have calendar data, or does response tell us that auth is needed?
        if (responseJSON.OK) {
            // Merge the retrieved list of provider calendars into calendarsInUse.
            // Don't touch calendars that are already on the list.
            let calsInUse = Object.assign({}, calendarsInUse);

            for (const retrievedCal of responseJSON.data) {
                if (!calsInUse[provider].some((cal) => cal.name === retrievedCal.name)) {
                    calsInUse[provider].push({
                        name: retrievedCal.name,
                        id: retrievedCal.id,
                        inUse: false,
                        provider: provider,
                        homesetUrl: retrievedCal.homesetUrl,  // defined only for CalDAV providers
                        lastRefreshed: retrievedCal.lastRefreshed
                    })
                }
            }

            setCalendarsInUse(calsInUse);
        }
        else {
            // Auth needed for this provider. Show dialog that explains to the user what will happen.
            setCurrentAuthData(responseJSON.data);
            setAuthNeeded(true);
        }
    };

    const closeSnackbar = () => {
        setSnackbarOpen(false);
        setSnackbarMessage('');
    };

    const closeAuthNeededDialog = () => {
        setAuthNeeded(false);
    };

    const statusMessage = React.useCallback((show, text) => {
        if (show) {
            setSnackbarMessage(text);
        }

        setSnackbarOpen(show);
    }, []);

    const doOAuth2 = async () => {
        setAuthNeeded(false);  // To close the dialog
        window.open(currentAuthData.authURL, '_blank');
    };

    const sendAppSpecificPassword = async (provider) => {
        setAuthNeeded(false);  // To close the dialog
        const response = await fetch(
            props.constants.BACKEND + currentAuthData.authURL,
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: provider,
                    state: currentAuthData.otherData.stateParam,
                    accountid: calendarAccountEmail,
                    password: appSpecificPassword
                })
            }
        );
        const responseJSON = await response.json();
        if (!responseJSON.OK) {
            if (retryCounter > 0) {
                setRetryCounter(0);
                setSnackbarMessage('Something went wrong again -- sorry.');
                setSnackbarOpen(true);

            }
            else {
                setRetryCounter(retryCounter + 1);
                setSnackbarMessage('Something went wrong saving your password. Mind trying again?');
                setSnackbarOpen(true);
                setAuthNeeded(true); // Reopen dialog
            }
        }

    };

    const addOrDropCalendar = async (action, provider, calname) => {
        setSnackbarMessage('Saving data...');
        setSnackbarOpen(true);

        const calindex = calendarsInUse[provider].findIndex((element) => element.name === calname);
        await fetch(
            props.constants.BACKEND + '/user/s/calendar',
            {
                credentials: 'include',
                method: action==='add' ? 'POST' : 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: provider,
                    id: calendarsInUse[provider][calindex].id,
                    name: calendarsInUse[provider][calindex].name,
                    homesetUrl: calendarsInUse[provider][calindex].homesetUrl
                })
            }
        );

        let calsInUse = Object.assign({}, calendarsInUse);
        if (action === 'add') {
            calsInUse[provider][calindex].inUse = true;
        }
        else {
            calsInUse[provider].splice(calindex, 1);
        }

        setCalendarsInUse(calsInUse);

        closeSnackbar();
    };

    const keepCalendar = (provider, calname) => {
        addOrDropCalendar('add', provider, calname);
    };

    const dropCalendar = (provider, calname) => {
        addOrDropCalendar('drop', provider, calname);
    };

    const refreshCal = async (provider, calname) => {
        setSnackbarMessage('Sending request...');
        setSnackbarOpen(true);

        let url = props.constants.BACKEND + `/user/s/calendar/${provider}/${calname}/events`;

        const response = await fetch(
            url,
            {
                credentials: 'include',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        closeSnackbar();
        if (response.status === 403 || response.status === 401) {
            setSessionExpired(true);
            return;
        }

        const responseJSON = await response.json();

        if (!responseJSON.OK) {
            setSnackbarMessage('Something went wrong with the request. Try again.');
            setSnackbarOpen(true);
        }
        else {
            let calsInUse = Object.assign({}, calendarsInUse);
            for (const cal of calsInUse[provider]) {
                if (cal.name === calname) {
                    cal.lastRefreshed = 'pending...';
                }
            }
            setCalendarsInUse(calsInUse);
        }
    };

    const getSlotMap = async (event) => {
        setSnackbarMessage('Fetching data...');
        setSnackbarOpen(true);
        const response = await fetch(
            props.constants.BACKEND + '/user/s/slotmap',
            {
                credentials: 'include',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        closeSnackbar();
        const responseJSON = await response.json();

        if (responseJSON.OK) {
            setSnackbarMessage(`Fetched ${responseJSON.data.days} days of data`);
            setSnackbarOpen(true);

            setSlotmapData(responseJSON);
        }
        else {
            setSnackbarMessage('There was a problem getting your data');
            setSnackbarOpen(true);
        }
    };

    return (
        <>
            <Header {...props} />
            <Container maxWidth="md">
                <h1>CalendarDance Insider Testing -- Welcome!</h1>
                {props.session.status &&
                    <table className="bp3-html-table bp3-interactive" style={{width: '100%'}}>
                        <thead>
                        <tr>
                            <th>Provider</th>
                            <th>Calendars</th>
                        </tr>
                        </thead>
                        <tbody>
                        {fetchingData &&
                        <tr>
                            <td>Retrieving calendar data...</td>
                        </tr>
                        }
                        {!fetchingData && Object.keys(calendarsInUse).length === 0 &&
                        <tr>
                            <td>No calendars yet</td>
                        </tr>
                        }
                        {!fetchingData && Object.keys(calendarsInUse).sort().map((provider) => {
                            return (
                                <tr key={provider}>
                                    <td>
                                        <span>{provider}</span>
                                        {Object.keys(calendarsInUse[provider]).length > 0 &&
                                            <>
                                                <br/>
                                                <button className="cd-button-link-tiny"
                                                        onClick={() => {getProviderCalendars(provider)}}                                                >
                                                Look for calendars again
                                                </button>
                                            </>
                                        }
                                    </td>
                                    <td>
                                        {calendarsInUse[provider] && calendarsInUse[provider].map((cal, idx) =>
                                            <div key={idx} className="cd-grid-line">
                                                <div className="cd-calendar-name" style={{fontWeight:cal.inUse?'bold':'normal'}}>
                                                    {cal.name}
                                                </div>
                                                {cal.inUse &&
                                                    <>
                                                        <button className="cd-button-link"
                                                                onClick={() => {dropCalendar(provider, cal.name)}}
                                                        >
                                                            Stop Using
                                                        </button>
                                                        < button className="cd-button-link"
                                                                 onClick={() => {refreshCal(provider, cal.name)}}                                                        >
                                                            Refresh
                                                        </button>
                                                        {cal.lastRefreshed &&
                                                        <span className="tiny">
                                                            Last refreshed: {cal.lastRefreshed._seconds ? formatTs(cal.lastRefreshed._seconds) : cal.lastRefreshed}
                                                        </span>
                                                        }
                                                    </>
                                                }
                                                {!cal.inUse &&
                                                <button className="cd-button-link"
                                                        onClick={() => {keepCalendar(provider, cal.name)}}
                                                >
                                                    Start Using
                                                </button>
                                                }
                                            </div>)
                                        }
                                        {calendarsInUse[provider] && Object.keys(calendarsInUse[provider]).length === 0 &&
                                            <button
                                                className="cd-button-link"
                                                onClick={() => {getProviderCalendars(provider)}}
                                            >
                                                Look for calendars
                                            </button>
                                        }
                                    </td>
                                </tr>
                            )
                        })
                        }
                        </tbody>
                    </table>
                }
                {props.session.status &&
                <>
                    <DanceTable {...props} statusMessage={statusMessage}>
                    </DanceTable>
                    <Button
                        type="button"
                        className="calendardance-button-sm"
                        intent="primary"
                        onClick={() => {setFreebusyOpen(!freebusyOpen)}}
                        style={{width: '20%'}}
                    >
                        {freebusyOpen ? 'Hide' : 'Show'} my free/busy slots
                    </Button>
                    <Collapse isOpen={freebusyOpen}>
                        <Button
                            type="button"
                            className="calendardance-button-sm"
                            intent="primary"
                            onClick={getSlotMap}
                            style={{width: '20%', marginLeft:'60%'}}
                        >
                        Refresh free/busy data
                        </Button>
                        <div style={{width:'100%', marginTop: '10px'}}>
                            {Object.keys(slotmapData).length > 0 &&
                            <SlotMapGraph {...slotmapData} />
                            }
                            {Object.keys(slotmapData).length === 0 &&
                            <pre>No data</pre>
                            }
                        </div>
                    </Collapse>
                </>
                }
                <Snackbar
                    open={snackbarOpen}
                    message={snackbarMessage}
                    action={
                        <>
                            <React.Fragment>
                                <IconButton size="small" aria-label="close" color="inherit" onClick={closeSnackbar}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </React.Fragment>
                        </>
                    }
                />
            </Container>
            <Dialog classes={{paper: "calendardance-dialog"}} open={authNeeded}>
                <DialogTitle>CalendarDance Needs Permission</DialogTitle>
                {currentAuthData.scheme === 'OAuth2' &&
                <>
                    <p>
                        OAuth2 text goes here.
                    </p>
                    <Button onClick={closeAuthNeededDialog}
                            variant="contained"
                            size="medium"
                            className="calendardance-button-sm"
                            intent="secondary">
                        Cancel
                    </Button>
                    <Button onClick={doOAuth2}
                            variant="contained"
                            size="medium"
                            className="calendardance-button-sm"
                            intent="primary">
                        Go to {currentAuthData.provider} for permission
                    </Button>
                </>
                }
                {currentAuthData.scheme === 'Basic' &&
                    <>
                        <p>
                            Basic text goes here.
                        </p>
                        <InputGroup
                            large
                            placeholder="Email with this calendar provider"
                            value={calendarAccountEmail}
                            onChange={event => setCalendarAccountEmail(event.target.value)}
                        />
                        <InputGroup
                            large
                            placeholder="CalendarDance-specific password"
                            type="password"
                            value={appSpecificPassword}
                            onChange={event => setAppSpecificPassword(event.target.value)}
                        />
                        <Button onClick={closeAuthNeededDialog}
                                variant="contained"
                                size="medium"
                                className="calendardance-button-sm"
                                intent="secondary">
                            Cancel
                        </Button>
                        <Button onClick={() => {sendAppSpecificPassword(currentAuthData.provider)}}
                                variant="contained"
                                size="medium"
                                disabled={appSpecificPassword.length === 0}
                                className="calendardance-button-sm"
                                intent="primary">
                            Save Password
                        </Button>
                    </>
                }
            </Dialog>
            <Dialog classes={{paper: "calendardance-dialog"}} open={sessionExpired}>
                <DialogTitle>Your session has Expired</DialogTitle>
                <Card interactive={true} elevation={Elevation.TWO}>
                    <h5>Please login</h5>
                    <p>
                        For security purposes, CalendarDance sessions expire.<br/>
                        You will need to login again.
                    </p>
                    <Button onClick={() => setSessionExpired(false)}
                            variant="contained"
                            size="medium"
                            className="calendardance-button-sm"
                            intent="secondary"
                    >
                        OK
                    </Button>
                </Card>
            </Dialog>
        </>
    )
}
