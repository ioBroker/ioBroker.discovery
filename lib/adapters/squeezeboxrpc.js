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
    tools.testPort(ip, 9090, 500, {
        onConnect: (ip, port, client) => {
            options.log.debug('squeezeboxrpc: Got connection to possible LMS on ' + ip + ':' + port);
            client.write('player count ?\n');
        },
        onReceive: (data, ip, port, client) => {
            if (!data) {
                return false;
            }
            if (Buffer.isBuffer(data)) {
                data = data.toString();
            }
            if (typeof data !== 'string') {
                return false;
            }
            data = data.trim();
            options.log.debug('squeezeboxrpc: Got response from possible LMS on ' + ip + ':' + port + ' = ' + data);
            return (/^player count \d+$/i).test(data);
        }
    }, (err, found, ip, port) => {
        if (found) {
            let instance = tools.findInstance(options, 'squeezeboxrpc', obj =>
                obj.native.server === ip || obj.native.server === device._name);
            
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('squeezeboxrpc', options),
                    common: {
                        name: 'squeezeboxrpc',
                        title: 'squeezeboxrpc Server (' + ip + ')'
                    },
                    native: {
                        server: ip,
                        elapsedInterval: 5
                    },
                    comment: {
                        add: [ip]
                    }
                };
                options.newInstances.push(instance);
                options.log.debug('squeezeboxrpc: Adding new instance: ' + ip);
                callback(null, true, ip);
                return;
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
