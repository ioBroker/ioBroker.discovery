'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options) {
    let instance = tools.findInstance(options, 'hp-ilo', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('hp-ilo', options);
        instance = {
            _id: id,
            common: {
                name: 'hp-ilo'
            },
            native: {
                ip: ip
            },
            comment: {
                add: 'HP ILO management - ' + ip
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
        if (upnp._location && upnp._location.includes('HP-iLO')) {
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });
    
    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; //TODO check if location call is needed
exports.timeout = 500;
