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

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */

// current poll period: 5min (300000ms)
const UPDATE_PERIOD=300000;
let adapter;
let authToken="";
let gw="";
let currentComfortTemp=0;
let boilerInterval;

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

    adapter.log.debug("updateBoiler()");

    if (authToken=="") {
        adapter.log.debug("Not logged in yet, attempting login");
        loginBoiler();
        return;
    }
    if (gw=="") {
        adapter.log.debug('Gateway not set yet, waiting...');
        return;
    }
    
    let url='https://www.ariston-net.remotethermo.com/api/v2/velis/slpPlantData/' +
        gw + '?umSys=si';

    axios.get(url, {
        headers: {
            'Ar.authtoken': authToken
        }
    }).then(function (response) {
        if (response.status==200) {
            adapter.log.debug("Got waterTemp from ariston-net: " + response.data.waterTemp);
            // update state with values received from API
            updateState("ariston-remotethermo.0.boiler.waterTemp", response.data.waterTemp);
            updateState("ariston-remotethermo.0.boiler.comfortTemp", response.data.comfortTemp);
            updateState("ariston-remotethermo.0.boiler.mode", response.data.mode);
            updateState("ariston-remotethermo.0.boiler.opMode", response.data.opMode);
            updateState("ariston-remotethermo.0.boiler.boostOn", response.data.boostOn);
            updateState("ariston-remotethermo.0.boiler.hpState", response.data.hpState);
            updateState("ariston-remotethermo.0.boiler.on", response.data.on);
        } else if (response.status==405) {
            adapter.log.info("updateBoiler(): Authentication expired, re-login");
            loginBoiler();
        } else {
            adapter.log.error("updateBoiler(): Unexpected HTTP response code: " + response.status);
        }
    })
    .catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`updateBoiler(): Got throttled ${secs} seconds`);
            adapter.log.debug(`updateBoiler(): Rescheduling updateBoiler ${secs} seconds`);
            setTimeout(() => { updateBoiler(); },(parseInt(secs)+1)*1000);
        } else if (error.response.status==405) {
            adapter.log.info("updateBoiler(): Authentication expired, re-login 2");
            loginBoiler();
        } else {
            adapter.log.error("updateBoiler(): Unexpected HTTP response code: " + error.response.status);
        }
    })
}

function getGateway() {

    adapter.log.debug('getGateway()');

    axios.get('https://www.ariston-net.remotethermo.com/api/v2/velis/plants', {
        headers: {
            'Ar.authtoken': authToken
        }
    }).then(function (response) {
        if (response.status==200) {
            gw=response.data[0].gw;
            adapter.log.info(`Got GatewayID: ${gw}`);
            adapter.setStateAsync("ariston-remotethermo.0.boiler.gw", 
                {val: response.data[0].gw, ack: true});
            // everything's ready now, fetch status from API
            updateBoiler();
        } else {
            adapter.log.error("getGateway(): Unexpected HTTP return code " + response.status);
        }
    }).catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`getGateway(): Got throttled ${secs} seconds`);
            adapter.log.debug(`Rescheduling getGateway ${secs} seconds`);
            setTimeout(() => { getGateway(); },(parseInt(secs)+1)*1000);
        } else {
            adapter.log.error("getGateway(): Unexpected HTTP return code " + response.status);
        }
    })
}

function updateComfortTemp(newTemp) {

    if (gw=="") return;

    let update={
        "new": {
            "comfort": newTemp,
            "reduced": 0.0
        },
        "old": {
            "comfort": currentComfortTemp,
            "reduced": 0.0
        }
    };

    let url="https://www.ariston-net.remotethermo.com/api/v2/velis/slpPlantData/" +
        gw + "/temperatures?umSys=si";
    axios.post(url, update, {headers: {'Ar.authtoken': authToken}})
      .then(function (response) {
        if (response.status==200) {
            adapter.log.info("Update comfortTemp successful");
            adapter.setStateAsync("ariston-remotethermo.0.boiler.comfortTemp",
                {ack: true});
        }
      })
      .catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`updateComfortTemp(): Got throttled ${secs} seconds`);
            adapter.log.debug(`updateComfortTemp(): Rescheduling ${secs} seconds`);
            setTimeout(() => { updateComfortTemp(newTemp);},(parseInt(secs)+1) * 1000);
        } else {
            adapter.log.error("updateComfortTemp(): Unexpected HTTP return code " + error.response.status);
        }
      });
}

function onOff(target) {

    if (gw=="") return;

    adapter.log.debug("OnOff: " + target.toString());

    let url="https://www.ariston-net.remotethermo.com/api/v2/velis/slpPlantData/" +
    gw + "/switch";
    axios.post(url, target.toString(), {headers: {'Ar.authtoken': authToken, 'Content-Type': 'application/json'}})
    .then(function (response) {
        if (response.status==200) {
            if (target) {
                adapter.log.info("Boiler switched on");
            } else {
                adapter.log.info("Boiler switched off");
                adapter.setStateAsync("ariston-remotethermo.0.boiler.on",
                    {ack: true});
            }
        }
    })
    .catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`onOff(): Got throttled ${secs} seconds`);
            adapter.log.debug(`onOff(): Rescheduling ${secs} seconds`);
            setTimeout(() => { onOff(target); },(parseInt(secs)+1) * 1000);
        } else {
            adapter.log.error("onOff(): Unexpected HTTP return code " + error.response.status);
        }
    });
}

function boost(target) {
    if (gw=="") return;
 
    let state="false";
    if (target=true) state="true";

    let url="https://www.ariston-net.remotethermo.com/api/v2/velis/slpPlantData/" +
        gw + "/boost";
    axios.post(url, state, {headers: {'Ar.authtoken': authToken}})
    .then(function (response) {
        if (response.status==200) {
            if (target) 
                adapter.log.info("Boiler boost on");
            else
                adapter.log.info("Boiler boost off");
                adapter.setStateAsync("ariston-remotethermo.0.boiler.boostOn",
                    {ack: true});
        }
    })
    .catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`boost(): Got throttled ${secs} seconds`);
            adapter.log.debug(`boost(): Rescheduling ${secs} seconds`);
            setTimeout(() => {boost(target);},(parseInt(secs)+1) * 1000);
        } else {
            adapter.log.error("boost(): Unexpected HTTP return code " + error.response.status);
        }
    });
}

function loginBoiler() {

    if (adapter.config.password=="" || adapter.config.email=="") {
        adapter.log.error("Login Data missing...");
        return;
    }
    
    axios.post('https://www.ariston-net.remotethermo.com/api/v2/accounts/login', {
        usr: adapter.config.email,
        pwd: adapter.config.password,
        imp: false,
        notTrack: true,
        appInfo: {
            os: 2,
            appVer: "5.6.772.40151",
            appId: "com.remotethermo.aristonnet"
        }
    })
    .then(function (response) {
        if (response.status==200 && 'token' in response.data) {
            adapter.log.info("Login Successful, got token");
            authToken=response.data.token;
            // now fetch gateway ID
            getGateway();
        }
    })
    .catch(function (error) {
            adapter.log.error("boost(): Unexpected HTTP return code " + error.response.status);
        
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
                callback();
            }
        },
        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                // The state was changed
                adapter.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                if (id == "ariston-remotethermo.0.boiler.comfortTemp" && state.ack == false) {
                    adapter.log.info(`New comfort temp requested: ${state.val}`);
                    updateComfortTemp(state.val);
                }
                if (id == "ariston-remotethermo.0.boiler.on" && state.ack == false) {
                    onOff(state.val);
                }
                if (id == "ariston-remotethermo.0.boiler.boostOn" && state.ack == false) {
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