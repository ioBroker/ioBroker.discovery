'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language

    const name = ip;
    let timeout = setTimeout(() => {
        timeout = null;
        if (server) {
            server.close(() => {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            });
        }
    }, 500);
    const browse = new Buffer([0x01, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18]);

    const server = dgram.createSocket({type: 'udp4', reuseAddr: true});

    server.on('listening', () => {
        server.setBroadcast(true);
        const port = server.address().port;
        setImmediate(() => server.send(browse, 0, browse.length, 58009, ip || '255.255.255.255'));
    });

    server.on('error', error => adapter.log.error(error));

    server.on('message', (msg, remote) => {
        console.log(remote.address + ':' + remote.port + ' - ' + msg);

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        server.close(() => {
            let instance;
            let fromOldInstances = false;
            for (let j = 0; j < options.newInstances.length; j++) {
                if (options.newInstances[j].common && options.newInstances[j].common.name === 'ping') {
                    instance = options.newInstances[j];
                    break;
                }
            }
            if (!instance) {
                for (let i = 0; i < options.existingInstances.length; i++) {
                    if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'ping') {
                        instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                        fromOldInstances = true;
                        break;
                    }
                }
            }
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('ekey', options),
                    common: {
                        name: 'ekey',
                        title: 'ekey (' + name + ')'
                    },
                    native: {
                        devices: []
                    },
                    comment: {
                        add: []
                    }
                };
                options.newInstances.push(instance);
            } else {
                instance.native = instance.native || {};
                instance.native.devices = instance.native.devices || [];
            }

            if (!instance.native.devices.find(dev => dev.ip === ip)) {
                instance.native.devices.push({ip: ip, protocol: 'home'});
                if (fromOldInstances) {
                    options.newInstances.push(instance);
                    instance.comment = instance.comment || {};
                }
                if (instance.comment.ack) instance.comment.ack = false;

                if (!instance.comment.add) {
                    instance.comment.extended = instance.comment.extended || [];
                    instance.comment.extended.push(device._name || ip);
                } else {
                    instance.comment.add.push(device._name || ip);
                }
            }

            if (callback) {
                callback(null, !instance, ip);
                callback = null;
            }
        });
    });

    server.bind();
}

exports.detect = detect;
exports.type = ['udp'];// make type=serial for USB sticks // TODO check if udp
exports.timeout = 600;