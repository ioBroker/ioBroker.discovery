'use strict';
const tools = require('../tools.js');

const adapterName = 'heos';
const searchDeviceType = 'urn:schemas-denon-com:device:ACT-Denon:1';

function addHeos(ip, data, options) {
    let instance;
    for (let j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === adapterName) {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (let i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === adapterName) {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                break;
            }
        }
    }

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: 'HEOS'
            },
            native: {
            },
            comment: {
                add: 'HEOS',
                advice: false,
                inputs: [
                    {
                        name: 'native.username',
                        def: '',
                        required: true,
                        type: 'username', 
                        title: 'Username' 
                    },
                    {
                        name: 'native.password',
                        def: '',
                        required: true,
                        type: 'password', 
                        title: 'Password' 
                    }
                ]
            }
        };
        options.newInstances.push(instance);
        return true;
    } 
    return false;
}

function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (JSON.stringify(device._upnp).includes(searchDeviceType)) {
            options.log.debug('HEOS found: ' + JSON.stringify(upnp));
            if (addHeos(ip, device, options)) {
                foundInstance = true;
            } else {
                options.log.debug("HEOS adapter already exists");
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect  = detect;
exports.type    = ['upnp'];
exports.timeout = 100;
