'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options) {
    let instance = tools.findInstance(options, 'enet', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('enet', options);
        instance = {
            _id: id,
            common: {
                name: 'enet'
            },
            native: {
                ip: ip
            },
            comment: {
                add: 'eNet device - ' + ip
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
        if (!foundInstance && upnp._location && upnp._location.includes('Albrecht Jung')) {
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; // make to upnp call location
exports.timeout = 100;
