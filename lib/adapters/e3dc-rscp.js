'use strict';

const tools = require('../tools.js');

function addE3dcRscp(ip, device, options) {
    let instance = tools.findInstance(options, 'e3dc-rscp', obj => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('e3dc-rscp', options),
            common: {
                name: 'e3dc-rscp'
            },
            native: {
                "e3dc_ip": ip,
            },
            comment: {
                add: 'E3/DC (RSCP) device'
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

// Detects E3/DC device
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp.SERVER && upnp.SERVER.includes('RSCP_SERVICE_PROVIDER')) {
            options.log.debug('E3/DC RSCP device detected at: ' + ip);
            if (addE3dcRscp(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 100;
