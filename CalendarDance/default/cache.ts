let _cache = {};

const p = new Promise((resolve) => {
    let intervalID = setInterval(() => {
        if (_cache['initialized'] === true) {
            clearInterval(intervalID);
            resolve();
        }
    }, 1000);
})

export const cacheGet = async (key) => {
    await p;
    return _cache[key];
}

export const cacheSet = (key, value) => {
    _cache[key] = value;
}

