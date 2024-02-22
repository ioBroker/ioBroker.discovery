'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options) {
    let instance = tools.findInstance(options, 'lametric', obj => obj.native.lametricIp === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('lametric', options),
            common: {
                name: 'lametric'
            },
            native: {
                lametricIp: ip,
            },
            comment: {
                add: 'LaMetric device'
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp._location && upnp._location.includes('LaMetric Time')) {
            options.log.debug('LaMetric device detected at: ' + ip);
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 100;
