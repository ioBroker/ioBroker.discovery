'use strict';

const tools = require('../tools.js');

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
    const name = ip + (device._name ? (' - ' + device._name) : '');

    tools.httpGet('http://' + ip + ':8080/rest/services', (err, data) => {
        if (data && data.indexOf('org.eclipse') !== -1) {
            let instance = tools.findInstance(options, 'openhab', obj => obj.native.ip === ip || obj.native.ip === device._name);

            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('openhab', options),
                    common: {
                        name: 'openhab',
                        enabled: true,
                        title: 'OpenHAB (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        url: 'http://' + ip + ':8080/rest'
                    },
                    comment: {
                        add: [name]
                    }
                };
                options.newInstances.push(instance);
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        } else {
            callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
