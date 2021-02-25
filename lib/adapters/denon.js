'use strict';
const tools = require('../tools.js');

function addInstance(ip, device, options, name, manufacturer) {
    options.log.debug('denon FOUND! ' + ip);
    let instance = tools.findInstance(options, 'denon', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('denon', options);
        instance = {
            _id: id,
            common: {
                name: name || manufacturer || 'DENON'
            },
            native: {
                ip: ip
            },
            comment: {
                add: (name || manufacturer || 'DENON') + ' - ' + ip
            }
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

// just check if IP exists
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp._location) {
            const lines = upnp._location.split('\n');

            let manufacturer;
            let name;
            lines.forEach(line => {
                let m = line.match('<manufacturer>(.+)</manufacturer>');
                if (m) {
                    manufacturer = m[1];
                }
                m = line.match('<friendlyName>(.+)</friendlyName>');
                if (m) {
                    name = m[1];
                }

                if (manufacturer && (manufacturer.toLowerCase() === 'denon' || manufacturer.toLocaleString() === 'marantz'))
                    if (addInstance(ip, device, options, name, manufacturer)) {
                        foundInstance = true;
                    }
            });
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect  = detect;
exports.type    = ['upnp'];// make type=serial for USB sticks // TODO make to upnp call location
exports.timeout = 100;
