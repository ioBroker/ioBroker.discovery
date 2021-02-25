'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options) {
    let instance = tools.findInstance(options, 'lgtv', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('lgtv', options);
        instance = {
            _id: id,
            common: {
                name: 'lgtv'
            },
            native: {
                ip: ip
            },
            comment: {
                add: 'LG WebOS TV - ' + ip
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
        if (!foundInstance && upnp.ST && upnp.ST === 'urn:lge-com:service:webos-second-screen:1') {
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 500;
