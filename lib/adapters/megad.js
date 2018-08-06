'use strict';

var tools = require(__dirname + '/../tools.js');

function addMegaDDevice(ip, device, options, native, callback) {
    var instance = tools.findInstance(options, 'megad', function (obj) {
        return (obj.native.ip === ip || obj.native.ip === device._name);
    });
    if (!instance) {
        var name = ip + (device._name ? (' - ' + device._name) : '');

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
    tools.httpGet('http://' + ip + '/wrg/?cf=1', function (err, data) {
        if (err || !data || data.length > 100 || data.indexOf('Unauthorized') === -1) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            tools.httpGet('http://' + ip + '/sec/', function (err, data) {
                if (data && data.indexOf('MegaD-328') !== -1) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(ip, device, options, {
                        ip: ip
                    }, callback);
                } else if (data && data.indexOf('MegaD-2561') !== -1) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(ip, device, options, {
                        ip: ip
                    }, callback);
                } else if (data && data.indexOf('MegaESP') !== -1) {
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
