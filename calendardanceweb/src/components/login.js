import React, {useState, useEffect} from 'react';
import {Redirect} from 'react-router-dom';
import Container from '@material-ui/core/Container'
import Snackbar from '@material-ui/core/Snackbar';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/Dialog';
import IconButton from '@material-ui/core/IconButton';
import Link from '@material-ui/core/Link';
import Header from './header';
import {InputGroup, FormGroup, Button} from '@blueprintjs/core';
import CloseIcon from '@material-ui/icons/Close';
import * as qs from 'query-string';
import ReCAPTCHA from "react-google-recaptcha";

export default function Login(props) {
    useEffect(() => {
        document.title = 'CalendarDance Login';
        const parsedQs = qs.parse(props.location.search);
        const r_param = parsedQs.r;
        const e_param = parsedQs.e;
        const t_param = parsedQs.t;
        const c_param = parsedQs.c;

        if (e_param) {
            setEmail(e_param);
        }

        if (c_param) {
            setSpecialCode(c_param);
        }

        if (t_param && !(t_param === 'a' || t_param === 'p')) {
            setSnackbarMessage('The web address contains some incorrect data; we\'re ignoring that.');
            setSnackbarOpen(true);
            return;
        }

        const codePhrases = {a: 'account activation', p: 'password reset'};

        if (r_param === '0') {
            setSnackbarMessage('Your account has been activated! Go ahead and login.');
            setSnackbarOpen(true);
        }
        else if (r_param === '2') {
            setSnackbarMessage('Your account was already activated. Go ahead and login.');
            setSnackbarOpen(true);
        }
        else if (r_param === '1') {
            setSnackbarMessage(`The ${codePhrases[t_param]} link has expired. Want another?`);
            if (t_param === 'a') {
                setActivationLinkExpired(true);
            }
            else {
                setPasswordResetLinkExpired(true);
            }
            setSnackbarOpen(true);
        }
        else if (r_param === '3') {
            setSnackbarMessage(`The ${codePhrases[t_param]} code is invalid.`);
            setSnackbarOpen(true);
        }
        else if (r_param === '4') {
            // Initiate change of password
            setObtainNewPassword(true);
        }
    }, [props.location.search]);

    const [redirectTo, setRedirectTo] = useState(undefined);
    const [email, setEmail] = useState('');
    const [specialCode, setSpecialCode] = useState('');
    const [password, setPassword] = useState('');
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [activationLinkExpired, setActivationLinkExpired] = useState(false);
    const [passwordResetLinkExpired, setPasswordResetLinkExpired] = useState(false);
    const [userWantsNewActivationLink, setUserWantsNewActivationLink] = useState(false);
    const [userWantsNewPasswordResetLink, setUserWantsNewPasswordResetLink] = useState(false);
    const [obtainNewPassword, setObtainNewPassword] = useState(false);
    const [captchaToken, setCaptchaToken] = useState('');

    const login = async () => {
        setSnackbarMessage('Logging you in...');
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
                    email: email,
                    password: password
                })
            }
        );

        const responseJSON = await response.json();
        if (responseJSON.data.credentialsValid) {
            setSnackbarOpen(false);

            props.session.set(true);
            props.user.set({
                sysadmin: responseJSON.data.sysadmin,
                fname: responseJSON.data.fname,
                userid: responseJSON.data.userid,
                handle: responseJSON.data.handle
            });
            let newpath = '/';
            setRedirectTo(newpath);
        }
        else {
            setSnackbarMessage('Login failed. Check that you typed your credentials correctly.');
            setSnackbarOpen(true);
        }
    };

    const closeSnackbar = () => {
        setSnackbarOpen(false);
        setSnackbarMessage('');
    };

    const selectPassword = (event) => {
        event.target.select();
    };

    const onCaptchaChange = async (value) => {
        setCaptchaToken(value);
    };

    const sendNewLink = async (linktype) => {
        const response = await fetch(
            props.constants.BACKEND+'/user/mailcode',
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    captchaToken: captchaToken,
                    linktype: linktype  // 'activation' or 'passwordreset'
                })
            }
        );

        const linktypePhrase = (linktype === 'activation') ? 'account activation' : 'password reset';
        const responseJSON = await response.json();

        if (!responseJSON.OK) {
            setSnackbarMessage(`Something went wrong trying to send your ${linktypePhrase} link. Try again.`);
            setSnackbarOpen(true);
        }
        else {
            setSnackbarMessage(`Check your email for the ${linktypePhrase} link.`);
            setSnackbarOpen(true);
        }
    };

    const sendNewActivationLink = async () => {
        setUserWantsNewActivationLink(false); // Close the dialog
        await sendNewLink('activation');
    };

    const sendNewPasswordResetLink = async () => {
        setUserWantsNewPasswordResetLink(false); // Close the dialog
        await sendNewLink('passwordreset');
    };

    const clickNewActivationLink = () => {
        setSnackbarOpen(false);
        setUserWantsNewActivationLink(true);
    };

    const clickNewPasswordResetLink = () => {
        setSnackbarOpen(false);
        setUserWantsNewPasswordResetLink(true);
    };

    const clickForgotPassword = () => {
        setUserWantsNewPasswordResetLink(true);
    }

    const sendNewPassword = async () => {
        setObtainNewPassword(false); // Close the dialog
        const response = await fetch(
            props.constants.BACKEND+'/user/changepassword',
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: specialCode,
                    password: password
                })
            }
        );

        const responseJSON = await response.json();
        if (!responseJSON.OK) {
            setSnackbarMessage(responseJSON.data);
            setSnackbarOpen(true);
        }
        else {
            setSnackbarMessage(`All set! Login with your new password.`);
            setSnackbarOpen(true);
        }
    };

    if (redirectTo) {
        return <Redirect to={redirectTo} />
    }

    return (
        <>
            <Header {...props} />
            <Container maxWidth="xs">
                <h2>Sign In to CalendarDance</h2>
                <form noValidate autoComplete="off">
                    <InputGroup
                        large
                        placeholder="Email"
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                    />

                    <InputGroup
                        large
                        placeholder="Password"
                        value={password}
                        type="password"
                        onFocus={selectPassword}
                        onChange={event => setPassword(event.target.value)}
                    />

                    <Button
                        type="button"
                        className="calendardance-button"
                        intent="primary"
                        icon="log-in"
                        onClick={login}
                        disabled={email==='' || password===''}
                    >
                        Sign In
                    </Button>
                    <br/><br/>
                    <Link href="#" onClick={clickForgotPassword}>Forgot password?</Link>
                </form>
                <Snackbar
                    open={snackbarOpen}
                    message={snackbarMessage}
                    action={
                        <>
                            {activationLinkExpired &&
                            <React.Fragment>
                                    <Button color="secondary" onClick={clickNewActivationLink}>Yes</Button>
                            </React.Fragment>
                            }
                            <React.Fragment>
                                <IconButton size="small" aria-label="close" color="inherit" onClick={closeSnackbar}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </React.Fragment>
                        </>
                    } />
                <Snackbar
                    open={snackbarOpen}
                    message={snackbarMessage}
                    action={
                        <>
                            {passwordResetLinkExpired &&
                            <React.Fragment>
                                <Button color="secondary" onClick={clickNewPasswordResetLink}>Yes</Button>
                            </React.Fragment>
                            }
                            <React.Fragment>
                                <IconButton size="small" aria-label="close" color="inherit" onClick={closeSnackbar}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </React.Fragment>
                        </>
                    } />
            </Container>

            <Dialog classes={{paper: "newlinkDialog"}} open={userWantsNewActivationLink} maxWidth="lg">
                <DialogTitle>New Activation Link</DialogTitle>
                <ReCAPTCHA className="captchaDiv" sitekey="6LfGGtcUAAAAAFdLHixbjvgO9ft2MTf6WVPRk9bQ"
                           onChange={onCaptchaChange}/>
                <Button onClick={sendNewActivationLink}
                        variant="contained"
                        size="medium"
                        color="secondary">
                    Send Activation Link
                </Button>
            </Dialog>

            <Dialog classes={{paper: "newlinkDialog"}} open={userWantsNewPasswordResetLink} maxWidth="lg">
                <DialogTitle>New Password Reset Link</DialogTitle>
                <form noValidate autoComplete="off">
                    <FormGroup
                        label="Email you use with CalendarDance"
                    >
                        <InputGroup
                            large
                            placeholder="Email"
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                        />
                    </FormGroup>
                    <ReCAPTCHA className="captchaDiv" sitekey="6LfGGtcUAAAAAFdLHixbjvgO9ft2MTf6WVPRk9bQ"
                               onChange={onCaptchaChange}/>
                    <Button onClick={sendNewPasswordResetLink}
                            variant="contained"
                            size="medium"
                            color="secondary">
                        Send Password Reset Link
                    </Button>
                </form>
            </Dialog>

            <Dialog classes={{paper: "newlinkDialog"}} open={obtainNewPassword} maxWidth="lg">
                <DialogTitle>Supply New Password</DialogTitle>
                <Container maxWidth="xs">
                    <h2>Enter New Password</h2>
                        <form noValidate autoComplete="off">
                            <InputGroup
                                large
                                placeholder="New password"
                                onChange={event => setPassword(event.target.value)}
                            />
                            <Button onClick={sendNewPassword}
                                    variant="contained"
                                    size="medium"
                                    color="secondary">
                                Submit New Password
                            </Button>
                        </form>
                </Container>
            </Dialog>

        </>
    )
}
