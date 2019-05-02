'use strict';

const tools = require('../tools.js');

// just check if IP exists
function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // options.device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }

    if (ip === '127.0.0.1') {
        callback(null, false, ip);
        return;
    }
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
            _id: tools.getNextInstanceID('ping', options),
            common: {
                name: 'ping'
            },
            native: {
                devices: []
            },
            comment: {
                add: []
            }
        };
        options.newInstances.push(instance);
    }

    let isNew = false;
    let found = false;
    for (let d = 0; d < instance.native.devices.length; d++) {
        if (instance.native.devices[d].ip === ip) {
            found = true;
            break;
        }
    }

    if (!found) {
        instance.native.devices.push({
            ip:   ip,
            name: device._name || ip,
            room: ''
        });
        isNew = true;
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

    callback(null, isNew, ip);
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks