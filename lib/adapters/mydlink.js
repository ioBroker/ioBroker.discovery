'use strict';

const tools = require('../tools.js');
const adapterName = 'mydlink';

function addDevice(ip, device, options, callback) {
    // Try to find an existing instance for this IP

    //console.log('Found instance:', instance);
    const existingInstances = options.existingInstances.filter(i => i.common && i.common.name === adapterName);
    let instance;
    if (existingInstances.length) {
        for (const inst of existingInstances) {
            if (inst.native && inst.native.devices) {
                if (inst.native.devices.find(d => d.mac === device.mac)) {
                    console.log('Device', device.mac, '(', device.type, ') already configured. Skip.');
                    callback && callback(false);
                    return;
                }
            }
        }
        instance = existingInstances[0]; //just add to first instance.
    } else {
        //will only create one instance:
        instance = tools.findInstance(options, adapterName);
    }

    const pinInput = {
        name: 'native.devices.0.pin',
        def: '',
        type: 'password', // text, checkbox, number, select, password. Select requires
        title: 'PIN for ' + device.ip, // see translation in words.js
    };
    device.pollInterval = 30000;
    device.pinNotEncrypted = true;
    device.enabled = true;
    const name = device.ip + ' (' + device.type + ')';

    if (!instance) {
        const id = tools.getNextInstanceID(adapterName, options);
        options.newInstances.push({
            _id: id,
            common: {
                name: adapterName
            },
            native: {
                devices: [
                    device
                ]
            },
            comment: {
                add: [name],
                inputs: [pinInput]
            }
        });
    } else {
        instance.native.devices.push(device);
        pinInput.name = 'native.devices.' + (instance.native.devices.length - 1) + '.pin';
        if (!instance.comment) { //existing instance but was not yet touched by discovery.
            options.newInstances.push(instance);
            instance.comment = { extended: [] };
        }
        if (instance.comment.ack) {
            instance.comment.ack = false; //what does that do???
        }
        if (instance.comment.add) { //if we added the instance before, it will have "add" and we can add the device there, too.
            instance.comment.add.push(name);
        }
        if (instance.comment.extended) { //if it was existing instance, we need to extend it. Right???
            instance.comment.extended.push(name);
        }

        if(!instance.comment.inputs) {
            instance.comment.inputs = [];
        }
        instance.comment.inputs.push(pinInput);
    }
    callback(true);
}

function extractStringsFromBuffer(buffer) {
    const strings = [];
    let tmpStr = "";
    let nextStop = -1;
    for (const key of Object.keys(buffer)) {
        //console.log('key:', key);
        if (nextStop < 0) {
            nextStop = Number.parseInt(key, 10) + buffer[key];
            //console.log('Next str length: ', buffer[key], 'nextstop:', nextStop);
        } else {
            tmpStr += String.fromCharCode(buffer[key]);
            //console.log(tmpStr, ' from ', buffer[key]);
        }
        if (Number.parseInt(key, 10) === nextStop) {
            strings.push(tmpStr);
            //console.log('Adding string', tmpStr);
            tmpStr = '';
            nextStop = -1;
        }
    }
    return strings;
}

function detect(ip, device, options, callback) {

    function fail() {
        callback && callback(null, false, ip);
        callback = null;
    }

    // We need to have mdns data with a TXT record
    if (!device._mdns  || !device._mdns.TXT || !device._mdns.TXT.data) {
        return fail();
    }

    //check for our mdns._name:
    if (device._name !== '_dhnap._tcp.local') {
        return fail();
    }

    //build detected device and fill it:
    const newdevice = {
        ip: ip, //or device._addr. or device._mdns.ip
    };

    //parse buffer:
    const keyValuePairs = extractStringsFromBuffer(device._mdns.TXT.data);
    for (const pair of keyValuePairs) {
        const [ key, value ] = pair.split('=');
        switch(key.toLowerCase()) {
            //extract mac from buffer:
            case 'mac': {
                newdevice.mac = value.toUpperCase();
                break;
            }
            //extract model number from buffer:
            case 'model_number': {
                newdevice.type = value;
                newdevice.name = value;
                break;
            }
            //if mydlink=true -> we should look at that device! :)
            case 'mydlink': {
                if (value === 'true') {
                    console.log('Is mydlink!!! :-)');
                    newdevice.mydlink = true; //ok, great :-)
                }
            }
        }
    }

    if (!newdevice.mydlink) {
        return fail();
    }

    //console.log('Adding ', newdevice);
    addDevice(ip, newdevice, options, callback);
}

module.exports = {
    detect,
    type: ['mdns'],
    timeout: 30000 //doesn't do anything, mdns timeout is hardcoded to 15000 in mdns.js (very bottom).
};
