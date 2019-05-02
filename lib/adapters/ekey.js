'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, callback) {
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
                title: 'ekey (' + ip + ')'
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
}

function detect(ip, device, options, callback) {
    const browse = new Buffer([0x01, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18]);

    tools.udpScan(ip, 58009, '0.0.0.0', 1234, browse, 1400, (err, data) => {
        options.log.debug(JSON.stringify(data)); //TODO remove
        if (!err) {
            addInstance(ip, device, options, callback);
        } else {
            options.log.error('eky error ' + err);
            callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['udp'];// make type=serial for USB sticks // TODO check if udp
exports.timeout = 500;