'use strict';

const tools = require('../tools.js');

function addInstance(ip, options) {
    let instance = tools.findInstance(options, 'wled', obj => obj.native.devices.filter(device => device.ip === ip));

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('wled', options),
            common: {
                name: 'wled',
            },
            native: {
                devices: {
                    asd: {
                        ip
                    }
                }
            },
            comment: {
                add: ['WLED', ip]
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

function detect(ip, device, options, callback) {
    if (device?._mdns?.PTR && device._mdns.PTR.datax.includes('_wled._tcp.local')) {
        callback(null, addInstance(ip, options), ip);
    } else {
        callback(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['mdns'];
exports.timeout = 1500;
