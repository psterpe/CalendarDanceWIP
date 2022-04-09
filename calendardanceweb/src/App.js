import React, {useState, useEffect} from 'react';
import { BrowserRouter as Router, Route } from 'react-router-dom';
import './App.css';
import SignUp from './components/signup';
import SysAdmin from './components/sysadmin';
import Login from './components/login';
import Home from './components/home';
import About from './components/about';

const CONSTANTS = {
  BACKEND: process.env.NODE_ENV === 'development' ? `http://${window.location.hostname}:5555` : 'https://calendardance.appspot.com'
};


function App() {
    const [validSession, setValidSession] = useState(false);
    const [userData, setUserData] = useState(undefined);
    const sessionControl = {status: validSession, set: setValidSession};
    const userControl = {userData: userData, set: setUserData};

    useEffect(() => {
        document.title = 'CalendarDance';

        async function checkSession() {
            const response = await fetch(
                CONSTANTS.BACKEND + '/user/session',
                {
                    credentials: 'include',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            const responseJSON = await response.json();
            if (responseJSON.OK) {
                setValidSession(true);
                setUserData({
                    fname: responseJSON.data.fname,
                    sysadmin: responseJSON.data.sysadmin,
                    userid: responseJSON.data.userid,
                    handle: responseJSON.data.handle
                });
            }
            else {
                setValidSession(false);
                setUserData(undefined);
            }
        }
        if (userData === undefined) {
            checkSession();
        }
    }, [userData]);

    return (
      <Router>
        <>
          <Route exact path="/" render={(props) => <Home {...props} constants={CONSTANTS} session={sessionControl} user={userControl} />} />
          <Route exact path="/about" render={(props) => <About {...props} constants={CONSTANTS} session={sessionControl} user={userControl} />}  />
          <Route exact path="/login" render={(props) => <Login {...props} constants={CONSTANTS} session={sessionControl} user={userControl} />} />
          <Route exact path="/signup" render={(props) => <SignUp {...props} constants={CONSTANTS} session={sessionControl} user={userControl} />} />
          <Route exact path="/sysadmin" render={(props) => <SysAdmin {...props} constants={CONSTANTS} session={sessionControl} user={userControl} />} />
        </>
      </Router>
  )
}

export default App;
