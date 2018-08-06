'use strict';

var tools = require(__dirname + '/../tools.js');

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
    var name = ip + (device._name ? (' - ' + device._name) : '');

    tools.httpGet('http://' + ip + ':49000/tr64desc.xml', function (err, data) {
        if (data && data.indexOf('InternetGatewayDevice') !== -1) {
            var instance = tools.findInstance(options, 'tr-064', function (obj) {
                return (obj.native.ip === ip || obj.native.ip === device._name);
            });
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('tr-064', options),
                    common: {
                        name: 'tr-064',
                        title: 'TR 064 (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        ip: ip,
                        devices: []
                    },
                    comment: {
                        add: [name],
                        inputs: [
                            {
                                name: 'native.user',
                                def: '',
                                type: 'text', // text, checkbox, number, select, password. Select requires
                                title: 'user', // see translation in words.js
                                options: { // example for select
                                    'name1': 'value1',
                                    'name2': 'value2',
                                    'name3': 'value3'
                                }
                            },
                            {
                                name: 'native.password',
                                def: '',
                                type: 'password',
                                title: 'password' // see translation in words.js
                            }
                        ]
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
