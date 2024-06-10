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
let adapter;
let authToken="";
let gw="";
let currentComfortTemp=0;

function updateState(StateID, value) {

    adapter.getState(StateID, function(err,state) {
        if (state==null || state.val!=value) {
            adapter.setStateAsync(StateID, {val: value, ack: true});
        }
    });
}

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
            updateState("ariston-remotethermo.0.boiler.waterTemp", response.data.waterTemp);
            updateState("ariston-remotethermo.0.boiler.comfortTemp", response.data.comfortTemp);
            updateState("ariston-remotethermo.0.boiler.mode", response.data.mode);
            updateState("ariston-remotethermo.0.boiler.opMode", response.data.opMode);
            updateState("ariston-remotethermo.0.boiler.boostOn", response.data.boostOn);
            updateState("ariston-remotethermo.0.boiler.hpState", response.data.hpState);
            updateState("ariston-remotethermo.0.boiler.on", response.data.on);
        } else {
            adapter.log.error("API returned status " + response.status);
        }
    })
    .catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`Got throttled ${secs} seconds`);
            adapter.log.debug(`Rescheduling updateBoiler ${secs} seconds`);
            setTimeout(() => { updateBoiler(); },(parseInt(secs)+1)*1000);
        } else {
            adapter.log.error("API returned status " + error.response.status);
        }
    })
}

function getGateway() {

    adapter.log.info('getGateway()');

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
            adapter.log.info("return code " + response.status);
        }
    }).catch(function (error) {
        if (error.response.status==429) {
            var secs=error.response.data.match(/\d+/)[0];
            adapter.log.info(`getGateway(): Got throttled ${secs} seconds`);
            adapter.log.debug(`Rescheduling getGateway ${secs} seconds`);
            setTimeout(() => { getGateway(); },(parseInt(secs)+1)*1000);
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
            adapter.log.info(`Got throttled ${secs} seconds`);
            adapter.log.debug(`Rescheduling updateComfortTemp ${secs} seconds`);
            setTimeout(() => { updateComfortTemp(newTemp);},(parseInt(secs)+1) * 1000);
        }
      });
}

function onOff(target) {

    if (gw=="") return;

    adapter.log.info("OnOff: " + target.toString());

    let url="https://www.ariston-net.remotethermo.com/api/v2/velis/slpPlantData/" +
    gw + "/switch";
    adapter.log.info("Url: " + url);
    axios.post(url, target.toString(), {headers: {'Ar.authtoken': authToken, 'Content-Type': 'application/json'}})
    .then(function (response) {
        if (response.status==200) {
           if (target) 
              adapter.log.info("Boiler switched on");
          else
             adapter.log.info("Boiler switched off");
        adapter.setStateAsync("ariston-remotethermo.0.boiler.on",
            {ack: true});
    }
  })
  .catch(function (error) {
    if (error.response.status==429) {
        var secs=error.response.data.match(/\d+/)[0];
        adapter.log.info(`Got throttled ${secs} seconds`);
        adapter.log.debug(`Rescheduling onOff ${secs} seconds`);
        setTimeout(() => { onOff(target); },(parseInt(secs)+1) * 1000);
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
        adapter.log.info(`Got throttled ${secs} seconds`);
        adapter.log.debug(`Rescheduling boost ${secs} seconds`);
        setTimeout(() => {boost(target);},(parseInt(secs)+1) * 1000);
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
        adapter.log.error(error.response.data);
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
                // clearTimeout(timeout1);
                // clearTimeout(timeout2);
                // ...
                // clearInterval(interval1);

                callback();
            } catch (e) {
                callback();
            }
        },

        // If you need to react to object changes, uncomment the following method.
        // You also need to subscribe to the objects with `adapter.subscribeObjects`, similar to `adapter.subscribeStates`.
        // objectChange: (id, obj) => {
        //     if (obj) {
        //         // The object was changed
        //         adapter.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        //     } else {
        //         // The object was deleted
        //         adapter.log.info(`object ${id} deleted`);
        //     }
        // },

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

        // If you need to accept messages in your adapter, uncomment the following block.
        // /**
        //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
        //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
        //  */
        // message: (obj) => {
        //     if (typeof obj === 'object' && obj.message) {
        //         if (obj.command === 'send') {
        //             // e.g. send email or pushover or whatever
        //             adapter.log.info('send command');

        //             // Send response in callback if required
        //             if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        //         }
        //     }
        // },
    }));
}

async function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    // adapter.log.info('config email: ' + adapter.config.email);
    // adapter.log.info('config password: ' + adapter.config.password);

    /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
    */
    // await adapter.setObjectNotExistsAsync('testVariable', {
    //     type: 'state',
    //     common: {
    //         name: 'testVariable',
    //         type: 'boolean',
    //         role: 'indicator',
    //         read: true,
    //         write: true,
    //     },
    //     native: {},
    // });


    // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
    // adapter.subscribeStates('testVariable');
    // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
    // adapter.subscribeStates('lights.*');
    // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
    // adapter.subscribeStates('*');

    /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
    */
    // the variable testVariable is set to true as command (ack=false)
    // await adapter.setStateAsync('testVariable', true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    // await adapter.setStateAsync('testVariable', { val: true, ack: true });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    // await adapter.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

    // examples for the checkPassword/checkGroup functions
    // adapter.checkPassword('admin', 'iobroker', (res) => {
    //     adapter.log.info('check user admin pw iobroker: ' + res);
    // });

    // adapter.checkGroup('admin', 'admin', (res) => {
    //     adapter.log.info('check group user admin group admin: ' + res);
    // });

    adapter.subscribeStates('ariston-remotethermo.0.boiler.comfortTemp');
    adapter.subscribeStates('ariston-remotethermo.0.boiler.on');
    adapter.subscribeStates('ariston-remotethermo.0.boiler.boostOn');

    updateBoiler();
    setInterval(updateBoiler,300000);
}

if (require.main !== module) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}