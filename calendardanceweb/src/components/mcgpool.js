import React, {useState, useEffect, useCallback} from 'react';

export const MCGPool = function MCGPool(props) {
    const [poolBody, setPoolBody] = useState([]);
    const [poolMembers, setPoolMembers] = useState({});

    const setMemberState = (mcgname, state) => {
        let mems = Object.assign(poolMembers, {});
        mems[mcgname].state = state;
        setPoolMembers(mems);
    };

    const recursiveMap = useCallback((children) => {
        const poolReport = (mcgname, state) => {
            console.log('poolReport ' + mcgname + ', state=' + state);
            setMemberState(mcgname, state);
            if (state) {
                turnOthersOff(mcgname);
            }
        };

        const poolRegister = (mcgname, offFunc) => {
            console.log('poolRegister ' + mcgname);
            if (poolMembers[mcgname]) {
                return;
            }
            let mems = Object.assign(poolMembers, {});
            mems[mcgname] = {offFunc: offFunc, state: false};
            setPoolMembers(mems);
        };

        const turnOthersOff = (mcgname) => {
            Object.keys(poolMembers).forEach((key, idx) => {
                if (key !== mcgname) {
                    poolMembers[key].offFunc();
                    setMemberState(key, false);
                }
            })
        } ;

        return React.Children.map(children, child => {
            if (!React.isValidElement(child)) {
                return child;
            }

            if (typeof(child) === 'object' && child.type.type && child.type.type.name === 'MutexControlGroup') {
                child = React.cloneElement(child, {
                    poolRegister: poolRegister,
                    poolReport: poolReport
                });
                return child;
            }

            if (child.props.children) {
                child = React.cloneElement(child, {
                    children: recursiveMap(child.props.children)
                });
            }

            return child;
        });
    }, [poolMembers]);

    useEffect(() => {
        const x = recursiveMap(props.children);
        setPoolBody(x);
    }, [recursiveMap]);

    return (
        <>
            {poolBody}
        </>
    )
};