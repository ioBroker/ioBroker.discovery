'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, callback) {
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
        callback(null, true, ip);
    }
    callback(null, false, ip);
}

function detect(ip, device, options, cb) {
    if (device._upnp.ST && device._upnp.ST == "urn:lge-com:service:webos-second-screen:1") {
        addInstance(ip, device, options, cb);
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 1500;
