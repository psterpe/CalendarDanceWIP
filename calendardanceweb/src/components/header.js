import React, {useState, useEffect} from 'react';
import {Redirect} from 'react-router-dom';
import {Navbar} from '@blueprintjs/core';
import {Button} from '@blueprintjs/core';
import {Alignment} from '@blueprintjs/core';

export default function Header(props) {
    const context = props.context || '';

    const [redirectTo, setRedirectTo] = useState(undefined);

    useEffect(() => {
    }, [props.session.status]);

    const clickCD = event => {
        setRedirectTo('/');
    };

    const clickSignup = event => {
        setRedirectTo('/signup');
    };

    const clickLogin = React.useCallback(event => {
        setRedirectTo('/login');
    }, []);

    const clickSysAdmin = event => {
        setRedirectTo('/sysadmin');
    };

    const clickLogout = async (event) => {
        props.session.set(false);
        props.user.set('loggedout');

        await fetch(
            props.constants.BACKEND+'/user/logout',
            {
                credentials: 'include',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        setRedirectTo('/login');
    };

    if (redirectTo && redirectTo !== props.location.pathname) {
        return <Redirect to={redirectTo} />
    }

    return (
        <>
            <Navbar
              fixedToTop
              className={"navbar " + context}
            >
                {props.session.status && props.user.userData && props.user.userData.sysadmin &&
                    <>
                        <Navbar.Group align={Alignment.LEFT}>
                            <Navbar.Heading>
                                <Button type="button" className={"bp3-minimal navbar " + context} icon="build" text="SysAdmin" onClick={clickSysAdmin} />
                            </Navbar.Heading>
                        </Navbar.Group>
                    </>
                }
                <Navbar.Group align={Alignment.RIGHT}>
                    <Navbar.Heading>
                        <Button type="button" className={"bp3-minimal navbar " + context} icon="home" text="CalendarDance" onClick={clickCD} />
                    </Navbar.Heading>
                    {props.user.userData &&
                    <Navbar.Heading>
                        <span className={"navbar " + context}>Hi, {props.user.userData.handle}</span>
                    </Navbar.Heading>
                    }
                    <Navbar.Divider />
                    {!props.session.status &&
                        <>
                            <Button type="button" className={"bp3-minimal navbar " + context} icon="new-person" text="Sign Up"
                                    onClick={clickSignup}/>
                            <Button
                                type="button"
                                className={"bp3-minimal navbar " + context}
                                icon="log-in"
                                onClick={clickLogin}
                            >
                                Sign In
                            </Button>
                        </>
                    }
                    {props.session.status &&
                        <>
                            <Button type="button" className={"bp3-minimal navbar " + context} icon="log-out" text="Sign Out"
                                    onClick={clickLogout}/>
                        </>
                    }
                </Navbar.Group>
            </Navbar>
        </>
    )
}
