'use strict';
const tools = require('../tools.js');

function addInstance(ip, device, options, name, manufacturer, callback) {
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
        return callback(true);
    }
    callback(false);
}

// just check if IP exists
function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }
    // options.language - language
    
    // try to detect SONOS
    if (device._type === 'ip') {
        const text =
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 1\r\n' +
            'ST: ssdp:all\r\n' +
            '\r\n';

        tools.ssdpScan(ip, text, true, (err, result, ip, xml) => {
            const lines = (xml || '').split('\n');
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
            });

            if (manufacturer && (manufacturer.toLowerCase() === 'denon' || manufacturer.toLocaleString() === 'marantz')) {
                addInstance(ip, result, options, name, manufacturer, isAdded => {
                    if (callback) {
                        callback(null, isAdded, ip);
                        callback = null;
                    }
                });
            } else {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            }
        });
    } else {
        callback(null, false, ip);
    }
}

exports.detect  = detect;
exports.type    = ['ip', 'upnp'];// make type=serial for USB sticks
exports.timeout = 1500;
