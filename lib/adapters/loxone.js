'use strict';

const tools = require('../tools.js');
const portRegex = /<presentationURL>https?:\/\/[^:]+:(\d+)[^\d<]*<\/presentationURL>/;

function addLoxone(ip, port, device, options) {
    let instance = tools.findInstance(options, 'loxone', obj => obj && obj.native && obj.native.host === ip);
    
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('loxone', options),
            common: {
                name: 'loxone'
            },
            native: {
                host: ip,
                port: port
            },
            comment: {
                add: [tools.translate(options.language, 'for %s', ip)],
                inputs: [
                    {
                        name: 'native.username',
                        def: '',
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'user' // see translation in words.js
                    },
                    {
                        name: 'native.password',
                        def: '',
                        type: 'password', // text, checkbox, number, select, password. Select requires
                        title: 'password' // see translation in words.js
                    }
                ]
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
}

function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (upnp._location && upnp._location.indexOf('loxone') !== -1) {
            const portArr = upnp._location.match(portRegex) || ['', '80'];
            if (addLoxone(ip, portArr[1], device, options)) {
                foundInstance = true;
            }
        }
    });
    
    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; // TODO check if upnp and location call
exports.timeout = 500;