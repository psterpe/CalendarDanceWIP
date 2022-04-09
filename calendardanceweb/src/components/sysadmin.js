import React, {useState, useEffect} from 'react';
import Container from '@material-ui/core/Container';
import Snackbar from '@material-ui/core/Snackbar';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import {InputGroup, Button, FormGroup, Classes} from '@blueprintjs/core';
import { DataGrid } from '@material-ui/data-grid';
import Header from './header';
import SlotMapGraph from './slotmapgraph';
import * as luxon from 'luxon';

export default function SysAdmin(props) {
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [userList, setUserList] = useState([]);

    const [authenticateEmail, setAuthenticateEmail] = useState('');
    const [authenticatePassword, setAuthenticatePassword] = useState('');

    const [activationCode, setActivationCode] = useState('');

    const [slotmapData, setSlotmapData] = useState({});
    const [showSlotmaps, setShowSlotmaps] = useState(false);
    const [selection, setSelection] = useState({});

    useEffect(() => {
        document.title = 'CalendarDance Test Harness';
    }, []);

    const hitRoot = async () => {
        const response = await fetch(props.constants.BACKEND, {
            credentials: 'include'
        });
        const responseJSON = await response.json();
        if (!responseJSON.OK) {
            setSnackbarMessage(responseJSON.data);
            setSnackbarOpen(true);
        }
        else {
            setSnackbarMessage('OK');
            setSnackbarOpen(true);
        }
    };

    const listUsers = async () => {
        setSnackbarMessage('Fetching...');
        setSnackbarOpen(true);

        const response = await fetch(props.constants.BACKEND+'/user/s/all', {
            credentials: 'include'
        });
        const responseJSON = await response.json();
        setSnackbarMessage('');
        if (!responseJSON.OK) {
            setSnackbarMessage(responseJSON.data);
            return;
        }
        else {
            setSnackbarOpen(false);
        }

        if (responseJSON.data.length === 0) {
            setUserList(['No users found.']);
        }
        else {
            let ulist = responseJSON.data.map((v, i) => {
                v.id = i;
                return v;
            })
            setUserList(ulist);
        }
    };

    const activateUser = async () => {
        setSnackbarMessage('Activating...');

        const response = await fetch(props.constants.BACKEND + '/user/activate/' + activationCode, {
            credentials: 'include'
        });
        const responseJSON = await response.json();
        setSnackbarMessage('');
        if (!responseJSON.OK) {
            setSnackbarMessage(responseJSON.data);
        }
    };

    const authenticateUser = async () => {
        setSnackbarMessage('Checking credentials...');
        setSnackbarOpen(true);

        const response = await fetch(
            props.constants.BACKEND+'/user/login',
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: authenticateEmail,
                    password: authenticatePassword
                })
            }
        );

        const responseJSON = await response.json();
        setSnackbarMessage('');
        if (!responseJSON.OK) {
            setSnackbarMessage(responseJSON.data);
        }
        else {
            setSnackbarMessage(`Credentials valid: ${responseJSON.data.credentialsValid}`);
        }

        setAuthenticateEmail('');
        setAuthenticatePassword('');
    };

    const formatDate = (dtstring) => {
        if (!dtstring) {
            return 'N/A';
        }
        else {
            const dt = luxon.DateTime.fromISO(dtstring);
            return dt.toLocaleString(luxon.DateTime.DATETIME_SHORT);
        }
    };

    const closeSnackbar = () => {
        setSnackbarOpen(false);
        setSnackbarMessage('');
    };

    const getSlotMapsToCompare = async (usera, userb) => {
        const response = await fetch(
            props.constants.BACKEND + `/user/s/slotmapcompare/${usera}/${userb}`,
            {
                credentials: 'include',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        return await response.json();
    };

    const padBefore = (data, days) => {
        const padarray = Array.from({length:24}).map(x => '11');
        while (days > 0) {
            data.unshift(padarray);
            days -= 1;
        }
    };

    const compareSelected = async (event) => {
        console.log('compareSelected called');

        if (selection.rowIds && selection.rowIds.length > 2) {
            setSnackbarMessage(`Select exactly 2 users; ${selection.rowIds.length} are selected`);
            setSnackbarOpen(true);
            return;
        }

        setSnackbarMessage('Fetching data...');
        setSnackbarOpen(true);

        const usera = userList[parseInt(selection.rowIds[0])].userid;
        const userb = userList[parseInt(selection.rowIds[1])].userid;
        const jsonData = await getSlotMapsToCompare(usera, userb);
        if (jsonData.OK) {
            setSnackbarOpen(false);
        }
        else {
            setSnackbarMessage('Something went wrong: ' + jsonData.data);
            return;
        }

        // The two slotmaps don't necessarily start on the same day, but for side-by-side visual
        // comparison, it will help if they do. Determine the earlier start date and pre-pad the
        // data for the other slotmap with FREE slots.
        const data_a = jsonData.data.a;
        data_a.startDate = luxon.DateTime.fromISO(data_a.startDate);
        const data_b = jsonData.data.b;
        data_b.startDate = luxon.DateTime.fromISO(data_b.startDate);

        const [earlier, later] =  data_a.startDate < data_b.startDate ? [jsonData.data.a, jsonData.data.b] : [jsonData.data.b, jsonData.data.a];
        const daysToPad = later.startDate.diff(earlier.startDate, 'days').days;

        padBefore(later.data, daysToPad);
        later.startDate = earlier.startDate; // Not really, but now we have pre-padded some fake days
        later.days += daysToPad;

        setSlotmapData(jsonData.data);
        setShowSlotmaps(true);
    };

    const widestColumn = 180;
    const userListColumns = [
        {
            field: 'lname',
            headerName: 'Last Name',
            flex: 0.5
        },
        {
            field: 'fname',
            headerName: 'First Name',
            flex: 0.5
        },
        {
            field: 'email',
            headerName: 'Email',
            flex: 1
        },
        {
            field: 'tz',
            headerName: 'TZ',
            flex: 1
        },
        {
            field: 'created',
            headerName: 'Created',
            valueGetter: (params) => formatDate(params.row.created),
            width: widestColumn
        },
        {
            field: 'activatedDate',
            headerName: 'Activated',
            valueGetter: (params) => formatDate(params.row.activatedDate),
            width: widestColumn
        },
        {
            field: 'deactivatedDate',
            headerName: 'Deactivated',
            valueGetter: (params) => formatDate(params.row.deactivatedDate),
            width: widestColumn
        },
        {
            field: 'userid',
            headerName: 'User ID',
            flex: 1
        },
    ];

    return (
        <>
            <Header {...props} context="sysadmin" />
            <Container maxWidth="sm">
                <h3 className={Classes.HEADING}>CalendarDance Web Test Harness [{process.env.NODE_ENV}]</h3>

                <FormGroup
                    className="calendardance-formgroup"
                    label="Health Check"
                >
                    <Button
                        type="button"
                        className="calendardance-button-sm"
                        intent="primary"
                        onClick={hitRoot}
                    >
                        Hit root
                    </Button>
                </FormGroup>

                <div className="spacer" />

                <FormGroup
                    className="calendardance-formgroup"
                    label="Activate"
                >
                    <InputGroup
                        large
                        placeholder="Activation code"
                        value={activationCode}
                        onChange={event => setActivationCode(event.target.value)}
                    />
                    <Button
                        type="button"
                        className="calendardance-button-sm"
                        intent="primary"
                        onClick={activateUser}
                    >Activate</Button>
                </FormGroup>


                <div className="spacer" />

                <FormGroup
                    className="calendardance-formgroup"
                    label="Authenticate"
                >
                    <form>
                        <InputGroup
                            large
                            placeholder="Email"
                            value={authenticateEmail}
                            onChange={event => setAuthenticateEmail(event.target.value)}
                        />
                        <InputGroup
                            large
                            placeholder="Password"
                            type="password"
                            value={authenticatePassword}
                            onChange={event => setAuthenticatePassword(event.target.value)}
                        />

                        <Button
                            type="button"
                            className="calendardance-button-sm"
                            intent="primary"
                            onClick={authenticateUser}
                        >
                            Authenticate
                        </Button>
                    </form>
                </FormGroup>

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
                    } />
            </Container>

            <div className="spacer" />

            <Container maxWidth="xl">
                <FormGroup
                    className="calendardance-formgroup"
                    label="List Users"
                >
                    <Button
                        type="button"
                        className="calendardance-button-sm"
                        intent="primary"
                        onClick={listUsers}
                    >List Users
                    </Button>

                    {selection.rowIds && selection.rowIds.length > 1 &&
                    <Button
                        type="button"
                        className="calendardance-button-sm"
                        intent="primary"
                        onClick={compareSelected}
                        style={{marginLeft: '25px'}}
                    >Compare Slotmaps
                    </Button>
                    }

                    <div style={{height: 300, marginTop: '10px'}}>
                        <DataGrid
                            columns={userListColumns}
                            rows={userList}
                            checkboxSelection
                            onSelectionChange={(newSelection) => setSelection(newSelection)}
                        />
                    </div>
                </FormGroup>
            </Container>

            <div className="spacer" />

            <Container maxWidth="xl">
                <div style={{width:'50%', marginTop: '10px', float: 'left'}}>
                    {showSlotmaps &&
                    <SlotMapGraph {...{data: slotmapData.a, tag:'A'}} />
                    }
                </div>
                <div style={{width:'50%', marginTop: '10px', float: 'left'}}>
                    {showSlotmaps &&
                    <SlotMapGraph {...{data: slotmapData.b, tag: 'B'}} />
                    }
                </div>

            </Container>
        </>
    )
}
