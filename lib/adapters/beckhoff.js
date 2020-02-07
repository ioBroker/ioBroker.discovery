'use strict';

const tools = require('../tools.js');

function addBeckhoff(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'beckhoff', obj => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('beckhoff', options),
            common: {
                name: 'beckhoff'
            },
            native: {
                'targetIpAdress': ip,
                'targetAmsNetId': `${ip}.1.1`,
            },
            comment: {
                add: 'beckhoff'
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

// Detects Beckhoff Device
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (upnp.USN && upnp.USN.includes('beckhoff.com')) {
            options.log.debug('Beckhoff Device detected at: ' + ip);
            if (addBeckhoff(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 100;
