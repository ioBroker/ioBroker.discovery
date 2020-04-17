'use strict';
const tools = require('../tools.js');

function addDevice(ip, xml, options){
    let instance = tools.findInstance(options, 'kodi', obj => obj.native.ip === ip);
    
    if (!instance){
        const id = tools.getNextInstanceID('kodi', options);
        const name = xml.match(/<friendlyName>(.*?)<\/friendlyName>/)[1];
        instance = {
            _id:     id,
            common:  {
                name:    'kodi',
                enabled: true,
                title:   obj => obj.common.title
            },
            comment: {
                add: [name, ip]
            }
        };

        options.newInstances.push(instance);

        instance.native = {
            ip,
            port:     9090,
            portweb:  8080,
            login:    '',
            password: ''
        };

        return true;
    } else {
        return false;
    }
}

function detect(ip, device, options, callback){
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (upnp._location && upnp._location.includes('Kodi') && upnp.ST && upnp.ST.includes('MediaRenderer')) {
            if (addDevice(ip, upnp._location, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 5000;
