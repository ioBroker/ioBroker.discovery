'use strict';

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

    let isNew = false;

    if (options._source === 'upnp') {
        let instance;
        let fromOldInstances = false;
        for (let j = 0; j < options.newInstances.length; j++) {
            if (options.newInstances[j].common && options.newInstances[j].common.name === 'upnp') {
                instance = options.newInstances[j];
                break;
            }
        }
        if (!instance) {
            for (let i = 0; i < options.existingInstances.length; i++) {
                if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'upnp') {
                    instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                    break;
                }
            }
            fromOldInstances = true;
        }

        if (!instance) {
            instance = {
                _id: tools.getNextInstanceID('upnp', options),
                common: {
                    name: 'upnp'
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

        // todo
        if (instance.native) {
            isNew = true;
            if (fromOldInstances) options.newInstances.push(instance);
        }
    }

    callback(null, isNew, ip);
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks