'use strict';

const tools = require('../tools.js');

function addDevice(ip, devName, model, id, options) {
    let instance = tools.findInstance(options, 'yeelight-2');

    if (!instance) {
        const name = ip + '(' + model + ')';

        instance = {
            _id: tools.getNextInstanceID('yeelight-2', options),
            common: {
                name: 'yeelight-2',
                enabled: true,
                title: 'yeelight-2 (' + ip + (devName ? (' - ' + devName) : '') + ')'
            },
            native: {
                devices: []
            },
            comment: {
                add: []
            }
        };

        options.newInstances.push(instance);

        instance.native.devices.push({
            name: id,
            ip,
            port: '55443',
            smart_name: '',
            type: model
        });

        instance.comment.add.push(name);
        return true;
    } else {
        return false;
    }
}


function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp.ST === 'wifi_bulb' && upnp['hue-bridgeid'] && !upnp['HUE-BRIDGEID']) {
            if (addDevice(ip, device._name, upnp.model, upnp.id, options)) {
                foundInstance = true;
            }
        }
    });


    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; // TODO check if data was upnp meaned
