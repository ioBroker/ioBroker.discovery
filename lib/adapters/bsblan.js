'use strict';

const tools = require('../tools.js');

const adapterName = 'bsblan';

function addInstance(ip, options) {
    let instance = tools.findInstance(options, adapterName, obj => obj.native.ip === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
            },
            native: {
                host: ip
            },
            comment: {
                add: ['BSB-LAN', ip]
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

function detect(ip, device, options, callback) {

    if (device._mdns && device._mdns.name && device._mdns.name.indexOf('BSB-LAN') === 0) {
        callback(null, addInstance(ip, options), ip);
    } else {
        callback(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['mdns'];
exports.timeout = 1500;
