'use strict';

const tools = require('../tools.js');

function insertDevice(options, instance, fromOldInstances, ip, name, room) {
    // find unique name
    let i = '';
    let found;

    do {
        found = false;
        for (let d = 0; d < instance.native.devices.length; d++) {
            if (instance.native.devices[d].name === name + i) {
                found = true;
                break;
            }
        }
        if (!found) break;
        if (!i) {
            i = 1;
        } else {
            i++;
        }
    } while(found);

    name = name + i;

    const device = {
        ip:   ip,
        name: name,
        room: tools.checkEnumName(options.enums['enum.rooms'], room || '')
    };

    instance.native.devices.push(device);

    if (fromOldInstances) {
        options.newInstances.push(instance);
        instance.comment = instance.comment || {};
    }
    if (!instance.comment.add) {
        instance.comment.extended = instance.comment.extended || [];
        instance.comment.extended.push(device.ip + ' - ' + device.name);
    } else {
        instance.comment.add.push(device.ip + ' - ' + device.name);
    }
}

function addSonos(ip, data, options, callback) {
    let instance;
    let fromOldInstances = false;
    for (let j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === 'sonos') {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (let i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'sonos') {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                fromOldInstances = true;
                break;
            }
        }
    }

    // sonos required web instance so check and install it too
    let webInstance = tools.findInstance(options, 'web', obj => obj && obj.native && !obj.native.secure);
    const id = tools.getNextInstanceID('sonos', options);

    if (!webInstance) {
        webInstance = {
            _id: tools.getNextInstanceID('web', options),
            common: {
                name: 'web',
                title: 'ioBroker web Adapter with no security'
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))]
            }
        };
        options.newInstances.push(webInstance);
    }
    if (!instance) {
        instance = {
            _id: id,
            common: {
                name: 'sonos'
            },
            native: {
                devices: []
            },
            comment: {
                add: [],
                required: [webInstance._id]
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
        if (data && data._location) {
            const mRoom = data._location.match(/<roomName>(.+)<\/roomName>/);
            const mName = data._location.match(/<displayName>(.+)<\/displayName>/);
            let name;
            let room;
            if (mRoom && mRoom[1]) {
                room = mRoom[1];
            }
            if (mName && mName[1]) {
                name = mName[1].replace(/[.:]/g, '_');
            }
            insertDevice(options, instance, fromOldInstances, ip, name, room);
        } else {
            insertDevice(options, instance, fromOldInstances, ip);
            callback(null, isNew, ip);
        }
    } else {
        callback(null, isNew, ip);
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    if (device._type === 'upnp' && JSON.stringify(device._upnp).indexOf("Sonos") !== -1) {
        addSonos(ip, device._upnp, options, callback);
    } else {
        callback(null, false, ip);
    }
}

exports.detect  = detect;
exports.type    = ['upnp'];// make type=serial for USB sticks
exports.timeout = 1500;
