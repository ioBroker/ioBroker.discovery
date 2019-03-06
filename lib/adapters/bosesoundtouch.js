'use strict';

const tools = require('../tools.js');
function addbosesoundtouch(ip, device, options) {
    let instance = tools.findInstance(options, 'bosesoundtouch', obj => obj && obj.native && obj.native.address === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('bosesoundtouch', options),
            common: {
                name: device.bosename
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

    device._upnp.forEach(function(upnp) {
        if(upnp.USN && upnp.USN.indexOf('BO5E') !== -1 && upnp.LOCATION && upnp.LOCATION.indexOf(ip) !== -1) {
            options.log.debug('Found new Bose Soundtouch Instance at ' + ip);
            tools.httpGet(upnp.LOCATION, (err, data) => {
                if (err || data.indexOf('<friendlyName>') !== -1) {
                    const name = data.substring(data.indexOf('<friendlyName>') + 14);
                    device.bosename = name.substring(0, name.indexOf('<'));
                    options.log.debug(device.bosename);

                    if(addbosesoundtouch(ip, device, options))
                        foundInstance = true;
                }
            });
        }
    });
    
    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];// make type=serial for USB sticks
