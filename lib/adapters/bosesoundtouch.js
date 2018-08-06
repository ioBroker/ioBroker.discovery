'use strict';

var tools = require(__dirname + '/../tools.js');
function addbosesoundtouch(ip, device, options, callback) {
    var instance = tools.findInstance(options, 'bosesoundtouch', function (obj) {
        if (obj && obj.native && obj.native.address === ip) {
            return true;
        }
    });

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
        callback(true);
    } else {
        callback(false);
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
    // options.language - language
    //options.log.debug(JSON.stringify(device));
    if (device._upnp && device._upnp.USN.indexOf('BO5E') !== -1 && device._upnp.LOCATION && device._upnp.LOCATION.indexOf(ip) !== -1) {
        options.log.debug('Found new Bose Soundtouch Instance at ' + ip);
        tools.httpGet(device._upnp.LOCATION, function (err, data) {
            //options.log.debug(data);
            if (err || data.indexOf('<friendlyName>') === -1) {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            } else {
                var name = data.substring(data.indexOf('<friendlyName>') + 14);
                device.bosename = name.substring(0, name.indexOf('<'));
                options.log.debug(device.bosename);

                addbosesoundtouch(ip, device, options, function (isAdded) {
                    callback && callback(null, isAdded, ip);
                });
            }
        });
    } else {
        callback && callback(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip', 'upnp'];// make type=serial for USB sticks
