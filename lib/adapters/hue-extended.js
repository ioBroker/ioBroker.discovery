'use strict';

const tools = require('../tools.js');

function addHue(ip, device, options) {
    let instance = tools.findInstance(options, 'hue-extended', obj => obj && obj.native && obj.native.bridgeIp === ip);

    if (!instance) {
        const name = ip + (device._name ? (' - ' + device._name) : '');

        instance = {
            _id: tools.getNextInstanceID('hue-extended', options),
            common: {
                name: 'hue-extended'
            },
            native: {
                bridgeIp: ip
            },
            comment: {
                add: [name]
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp['HUE-BRIDGEID'] || upnp['hue-bridgeid']) {
            if (addHue(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];// make type=serial for USB sticks
exports.timeout = 500;