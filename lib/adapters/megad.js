'use strict';

const tools = require('../tools.js');

function addMegaDDevice(ip, device, options, native, callback) {
    let instance = tools.findInstance(options, 'megad', obj => obj.native.ip === ip || obj.native.ip === device._name);
    if (!instance) {
        const name = ip + (device._name ? (' - ' + device._name) : '');

        instance = {
            _id: tools.getNextInstanceID('megad', options),
            common: {
                name: 'megad',
                title: 'MegaD-328 (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
            },
            native: native,
            comment: {
                add: [name]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    }
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
    tools.httpGet('http://' + ip + '/wrg/?cf=1', (err, data) => {
        if (err || !data || data.length > 100 || data.indexOf('Unauthorized') === -1) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            tools.httpGet('http://' + ip + '/sec/', (err, data) => {
                if (data && data.includes('MegaD-328')) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(ip, device, options, {
                        ip: ip
                    }, callback);
                } else if (data && data.includes('MegaD-2561')) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(ip, device, options, {
                        ip: ip
                    }, callback);
                } else if (data && data.includes('MegaESP')) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(ip, device, options, {
                        ip: ip
                    }, callback);
                } else {
                    if (callback) {
                        callback(null, false, ip);
                        callback = null;
                    }
                }
            });
        }
    });
}
exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
