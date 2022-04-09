import React, {useState, useEffect} from 'react';
import ReCAPTCHA from "react-google-recaptcha";
import Header from './header';
import {InputGroup, Button, Icon} from '@blueprintjs/core';
import {TimezoneDisplayFormat, TimezonePicker} from "@blueprintjs/timezone";
import Container from '@material-ui/core/Container';
import Card from '@material-ui/core/Card';

export default function SignUp(props) {
    useEffect(() => {
        document.title = 'CalendarDance Sign-Up';
    }, []);

    const [newuserLname, setNewuserLname] = useState('');
    const [newuserFname, setNewuserFname] = useState('');
    const [newuserEmail, setNewuserEmail] = useState('');
    const [newuserHandle, setNewuserHandle] = useState('');
    const [newuserPassword, setNewuserPassword] = useState('');
    const [newuserTZ, setNewuserTZ] = useState(undefined);
    const [captchaToken, setCaptchaToken] = useState('');
    const [submitButtonDisabled, setSubmitButtonDisabled] = useState(true);
    const [formSubmitted, setFormSubmitted] = useState(false);
    const [enrollmentResponse, setEnrollmentResponse] = useState({OK: true});

    const onChange = async (value) => {
        setCaptchaToken(value);
        setSubmitButtonDisabled(false);
    };

    const enrollUser = async () => {

        const response = await fetch(
            props.constants.BACKEND+'/user',
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    captchaToken: captchaToken,
                    email: newuserEmail,
                    handle: newuserHandle,
                    lname: newuserLname,
                    fname: newuserFname,
                    password: newuserPassword,
                    tz:    newuserTZ,
                })
            }
        );

        response.json().then((responseJSON) => {
            setEnrollmentResponse(responseJSON);
            setFormSubmitted(true);
        });

    };

    const tzpicker = (
        <TimezonePicker
            value={newuserTZ}
            onChange={setNewuserTZ}
            showLocalTimezone={true}
            valueDisplayFormat={TimezoneDisplayFormat.NAME}
        />
    );

    return (
        <>
            <Header {...props}></Header>

            <Container maxWidth="xs">
                <h2>Sign Up for CalendarDance</h2>
                <p className="helptext">
                    Required fields are marked with an asterisk&nbsp;<Icon icon="asterisk"/>
                </p>
                {!formSubmitted &&
                <form noValidate autoComplete="off">
                    <InputGroup
                        large
                        leftIcon="asterisk"
                        placeholder="First name"
                        value={newuserFname}
                        onChange={event => setNewuserFname(event.target.value)}
                    />

                    <InputGroup
                        large
                        placeholder="Last name"
                        value={newuserLname || ''}
                        onChange={event => setNewuserLname(event.target.value)}
                    />

                    <InputGroup
                        large
                        leftIcon="asterisk"
                        placeholder="Email"
                        value={newuserEmail}
                        onChange={event => setNewuserEmail(event.target.value)}
                    />

                    <InputGroup
                        large
                        leftIcon="asterisk"
                        placeholder="User name (what others will see)"
                        value={newuserHandle}
                        onChange={event => setNewuserHandle(event.target.value)}
                    />

                    <InputGroup
                        large
                        leftIcon="asterisk"
                        type="password"
                        placeholder="Create a password"
                        value={newuserPassword}
                        onChange={event => setNewuserPassword(event.target.value)}
                    />

                    <InputGroup
                        large
                        leftIcon="asterisk"
                        placeholder="Select your timezone"
                        rightElement={tzpicker}
                        value={newuserTZ}
                    >

                    </InputGroup>

                    <ReCAPTCHA className="captchaDiv" sitekey="6LfGGtcUAAAAAFdLHixbjvgO9ft2MTf6WVPRk9bQ"
                               onChange={onChange}/>
                    <Button
                        type="button"
                        className="calendardance-button"
                        intent="primary"
                        icon="new-person"
                        onClick={enrollUser}
                        disabled={submitButtonDisabled}
                    >
                        Sign Up
                    </Button>
                </form>
                }

                {formSubmitted && enrollmentResponse.OK &&
                <Card
                    raised
                >
                    Check your email for a message from CalendarDance. It will contain a link for you to
                    confirm your email address.
                </Card>
                }

                {formSubmitted && !enrollmentResponse.OK &&
                <Card>
                    Something went wrong: {enrollmentResponse.data}
                </Card>
                }
            </Container>        </>
    )
}
