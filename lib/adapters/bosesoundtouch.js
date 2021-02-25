'use strict';

const tools = require('../tools.js');

function addbosesoundtouch(ip, device, options) {
    let instance = tools.findInstance(options, 'bosesoundtouch', obj => obj && obj.native && obj.native.address === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('bosesoundtouch', options),
            common: {
                name: 'bosesoundtouch',
                title: device.bosename
            },
            native: {
                address: ip
            },
            comment: {
                add: ['Bose Soundtouch ' + device.bosename + ' (' + ip + ')']
            }
        };
        options.newInstances.push(instance);
        options.log.debug('Add new Bose Soundtouch Instance ' + device.bosename);
        return true;
    } else {
        return false;
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp.USN && upnp.USN.includes('BO5E') && upnp._location) {
            const name = upnp._location.substring(upnp._location.indexOf('<friendlyName>') + 14);
            device.bosename = name.substring(0, name.indexOf('<'));
            options.log.debug('Bode discovered: ' + device.bosename);

            if (addbosesoundtouch(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];// make type=serial for USB sticks
exports.timeout = 100;
