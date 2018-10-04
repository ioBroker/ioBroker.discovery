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

    // try to test TCP ports 8123
    let someFound = false;
    const name = ip + ((device._name && device._name !== ip) ? (' - ' + device._name) : '');

    tools.testPort(ip, 7072, 500, {
        onConnect: (ip, port, client) => client.write('\n\n\njsonlist2\n'), // assume there is no password
        onReceive: (data, ip, port, client) => data && !!data.toString().match(/^{/)
    },  (err, found, ip, port) => {
        if (found) {
            const instance = tools.findInstance(options, 'fhem', obj =>
                obj.native.host === ip || obj.native.host === device._name);
            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('fhem', options),
                    common: {
                        name: 'fhem',
                        title: 'FHEM (' + name + ')'
                    },
                    native: {
                        host: ip,
                        port: 7072
                    },
                    comment: {
                        add: ['FHEM (' + name + ')']
                    }
                });
                someFound = true;
            }
        }
        if (callback) {
            callback(null, found, ip);
            callback = null;
        }
    });
}

exports.detect  = detect;
exports.type    = 'ip';// make type=serial for USB sticks
exports.timeout = 500;