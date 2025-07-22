'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const axios = require('axios');
// Add cookie jar support
// @ts-ignore: No type declarations for axios-cookiejar-support in JS
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
// Patch axios for cookie jar support (for CommonJS)
// wrapper(axios); // This line is removed as per the edit hint

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */

// current poll period: 5min (300000ms)
const UPDATE_PERIOD=300000;
let adapter;
// Remove authToken
let gw='';
let boilerInterval;
let isLoggedIn = false;
let lastPlantData = null;

// Create a cookie jar and axios instance for session persistence
const cookieJar = new CookieJar();
// @ts-ignore: 'jar' is a runtime property supported by axios-cookiejar-support
const axiosInstance = wrapper(axios.create({
    jar: cookieJar,
    withCredentials: true
}));

// Update state variable
function updateState(StateID, value) {

    adapter.getState(StateID, function(err,state) {
        // only update state upon change
        if (state==null || state.val!=value) {
            adapter.setStateAsync(StateID, {val: value, ack: true});
        }
    });
}

// Main loop, fetch data from boiler
function updateBoiler() {
    adapter.log.debug('updateBoiler()');

    if (!isLoggedIn) {
        adapter.log.debug('Not logged in yet, attempting login');
        loginBoiler();
        return;
    }
    if (gw=='') {
        adapter.log.debug('Gateway not set yet, waiting...');
        return;
    }

    // New API URL
    const url = `https://www.ariston-net.remotethermo.com/R2/PlantHomeSlp/GetData/${gw}?fetchSettings=true&fetchTimeProg=false`;

    axiosInstance.get(url)
        .then(function (response) {
            if (response.data && response.data.ok && response.data.data && response.data.data.plantData) {
                const plantData = response.data.data.plantData;
                adapter.log.debug('Got plantData from ariston-net: ' + JSON.stringify(plantData));
                // update state with values received from API
                updateState('ariston-remotethermo.0.boiler.waterTemp', plantData.waterTemp);
                updateState('ariston-remotethermo.0.boiler.comfortTemp', plantData.comfortTemp);
                updateState('ariston-remotethermo.0.boiler.mode', plantData.mode);
                updateState('ariston-remotethermo.0.boiler.opMode', plantData.opMode);
                updateState('ariston-remotethermo.0.boiler.boostOn', plantData.boostOn);
                updateState('ariston-remotethermo.0.boiler.hpState', plantData.hpState);
                updateState('ariston-remotethermo.0.boiler.on', plantData.on);
                // Store latest plantData for use in setBoiler
                lastPlantData = plantData;
            } else {
                adapter.log.error('updateBoiler(): Unexpected response: ' + JSON.stringify(response.data));
            }
        })
        .catch(function (error) {
            if (error.response && error.response.status==429) {
                const secs=error.response.data.match(/\d+/)[0];
                adapter.log.info(`updateBoiler(): Got throttled ${secs} seconds`);
                adapter.log.debug(`updateBoiler(): Rescheduling updateBoiler ${secs} seconds`);
                setTimeout(() => { updateBoiler(); },(parseInt(secs)+1)*1000);
            } else {
                adapter.log.error('updateBoiler(): HTTP error: ' + (error.response ? error.response.status : error.message));
            }
        });
}

// Generic function to set boiler parameters
function setBoiler(viewModelChanges, callback) {
    if (!lastPlantData || !gw) {
        adapter.log.error('setBoiler(): No plant data or gateway ID available.');
        if (callback) callback(false);
        return;
    }
    const url = `https://www.ariston-net.remotethermo.com/R2/PlantHomeSlp/SetData/${gw}`;
    // Compose the full viewModel from lastPlantData
    const fullViewModel = {
        on: lastPlantData.on,
        plantMode: lastPlantData.mode, // map mode to plantMode
        opMode: lastPlantData.opMode,
        boostOn: lastPlantData.boostOn,
        comfortTemp: lastPlantData.comfortTemp,
        holidayUntil: lastPlantData.holidayUntil
        // Add more fields as needed
    };
    // Apply changes
    Object.assign(fullViewModel, viewModelChanges);
    // Compose the payload
    const payload = {
        plantData: Object.assign({}, lastPlantData, { gatewayId: gw }),
        viewModel: fullViewModel
    };
    adapter.log.debug('setBoiler(): Sending payload: ' + JSON.stringify(payload));
    axiosInstance.post(url, payload)
        .then(function (response) {
            if (response.data && response.data.ok) {
                adapter.log.info('setBoiler(): Update successful');
                if (callback) callback(true);
            } else {
                adapter.log.error('setBoiler(): Update failed: ' + JSON.stringify(response.data));
                if (callback) callback(false);
            }
        })
        .catch(function (error) {
            adapter.log.error('setBoiler(): HTTP error: ' + (error.response ? error.response.status : error.message));
            if (callback) callback(false);
        });
}

// Refactor updateComfortTemp to use setBoiler and update state on success
function updateComfortTemp(newTemp) {
    if (!gw) return;
    setBoiler({ comfortTemp: newTemp }, function(success) {
        if (success) {
            adapter.setStateAsync('ariston-remotethermo.0.boiler.comfortTemp', { val: newTemp, ack: true });
        }
    });
}

// Refactor onOff to use setBoiler and update state on success
function onOff(target) {
    if (!gw) return;
    adapter.log.debug('OnOff: ' + target.toString());
    setBoiler({ on: !!target }, function(success) {
        if (success) {
            adapter.setStateAsync('ariston-remotethermo.0.boiler.on', { val: !!target, ack: true });
        }
    });
}

// Refactor boost to use setBoiler and update state on success
function boost(target) {
    if (!gw) return;
    setBoiler({ boostOn: !!target }, function(success) {
        if (success) {
            adapter.setStateAsync('ariston-remotethermo.0.boiler.boostOn', { val: !!target, ack: true });
        }
    });
}

function getGateway() {
    adapter.log.debug('getGateway()');

    // Step 1: GET request to root
    axiosInstance.get('https://www.ariston-net.remotethermo.com/')
        .then(async function () {
            // Step 2: Inspect cookies for gateway ID
            const cookies = await cookieJar.getCookies('https://www.ariston-net.remotethermo.com/');
            const gwCookie = cookies.find(c => c.key.startsWith('ar.externalDomoticSystem_'));
            if (gwCookie) {
                // Step 3: Extract gateway ID from key
                const parts = gwCookie.key.split('_');
                if (parts.length === 2) {
                    gw = parts[1];
                    adapter.log.info(`Got GatewayID from cookie: ${gw}`);
                    adapter.setStateAsync('ariston-remotethermo.0.boiler.gw', {val: gw, ack: true});
                    // Step 4: Fetch status from API
                    updateBoiler();
                } else {
                    adapter.log.error('getGateway(): Unexpected cookie key format: ' + gwCookie.key);
                }
            } else {
                adapter.log.error('getGateway(): Gateway cookie not found.');
            }
        })
        .catch(function (error) {
            adapter.log.error('getGateway(): HTTP error: ' + (error.response ? error.response.status : error.message));
        });
}

function loginBoiler() {
    if (adapter.config.password=='' || adapter.config.email=='') {
        adapter.log.error('Login Data missing...');
        isLoggedIn = false;
        return;
    }

    // New login API
    axiosInstance.post('https://www.ariston-net.remotethermo.com/R2/Account/Login', {
        email: adapter.config.email,
        password: adapter.config.password,
        rememberMe: true,
        language: 'English_Us'
    })
        .then(function (response) {
            if (response.data && response.data.ok === true) {
                adapter.log.info('Login successful (cookie-based session)');
                isLoggedIn = true;
                // Now fetch gateway ID
                getGateway();
            } else {
                adapter.log.error('Login failed: ' + JSON.stringify(response.data));
                isLoggedIn = false;
            }
        })
        .catch(function (error) {
            adapter.log.error('loginBoiler(): HTTP error: ' + (error.response ? error.response.status : error.message));
            isLoggedIn = false;
        });
}

/**
 * Starts the adapter instance
 * @param {Partial<utils.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: 'ariston-remotethermo',

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            try {
                // Here you must clear all timeouts or intervals that may still be active
                clearInterval(boilerInterval);
                callback();
            } catch (e) {
                adapter.log && adapter.log.warn('[END 7 catch] adapter stopped ' + e);
                callback();
            }
        },
        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                // The state was changed
                adapter.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                if (id == 'ariston-remotethermo.0.boiler.comfortTemp' && state.ack == false) {
                    adapter.log.info(`New comfort temp requested: ${state.val}`);
                    updateComfortTemp(state.val);
                }
                if (id == 'ariston-remotethermo.0.boiler.on' && state.ack == false) {
                    onOff(state.val);
                }
                if (id == 'ariston-remotethermo.0.boiler.boostOn' && state.ack == false) {
                    boost(state.val);
                }
            } else {
                // The state was deleted
                adapter.log.info(`state ${id} deleted`);
            }
        },
    }));
}

async function main() {

    // subscribe changes to the following states
    adapter.subscribeStates('ariston-remotethermo.0.boiler.comfortTemp');
    adapter.subscribeStates('ariston-remotethermo.0.boiler.on');
    adapter.subscribeStates('ariston-remotethermo.0.boiler.boostOn');

    // trigger initial update before scheduling the periodic one
    updateBoiler();
    //
    boilerInterval=setInterval(updateBoiler,UPDATE_PERIOD);
}

if (require.main !== module) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}