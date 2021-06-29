'use strict';

const tools = require('../tools.js');
const adapterName = 'valloxmv';

function addValloxmv(ip, device, options) {
    let instance = tools.findInstance(options, adapterName, obj => obj && obj.native && obj.native.host === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('valloxmv', options),
            common: {
                name: 'valloxmv'
            },
            native: {
                host: ip
            },
            comment: {
                add: 'ValloxMV - ' + ip,
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
        if (!foundInstance && upnp.SERVER && upnp.SERVER.includes('vallox')) {
            options.log.debug('ValloxMV Device detected at: ' + ip);
            if (addValloxmv(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

module.exports = {
    detect,
    type: ['upnp'],
    timeout: 1500
};
