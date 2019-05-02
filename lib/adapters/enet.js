'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

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

    device._upnp.forEach(function(upnp) {
        if(upnp._location && upnp._location.indexOf('Albrecht Jung') !== -1) {
            if(addInstance(ip, device, options))
                foundInstance = true;
        }
    });
    
    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; // make to upnp call location
exports.timeout = 100;
