'use strict';

const tools = require(__dirname + '/../tools.js');


function addDevice(ip, name, options) {
    let instance = tools.findInstance(options, 'yeelight-2');

    if(!instance){
        if (!instance) {
            instance = {
                _id: tools.getNextInstanceID('yeelight-2', options),
                common: {
                    name: 'yeelight-2',
                    enabled: true,
                    title: 'yeelight-2 (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
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
        instance.native.devices.push({
            name: data.id,
            ip: ip,
            port: '55443',
            smart_name: '',
            type: data.model
        });

        instance.comment.add.push(name);
        return true;
    } else {
        return false;
    }
}


function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(function(upnp) {
        if(upnp.ST == "wifi_bulb" && upnp['hue-bridgeid'] && !upnp['HUE-BRIDGEID'])
        {
            options.log.debug(JSON.stringify(upnp));
            if(addDevice(ip, upnp.model, options))
                foundInstance = true;
        }
    });


    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; // TODO check if data was upnp meaned