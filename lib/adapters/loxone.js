'use strict';

const tools = require('../tools.js');
const portRegex = /<presentationURL>https?:\/\/[^:]+:(\d+)[^\d<]*<\/presentationURL>/;

function addLoxone(ip, port, device, options, callback) {
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
        callback(true);
    } else {
        callback(false);
    }
}

function detect(ip, device, options, callback) {
    const text =
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 1\r\n' +
        'ST: urn:schemas-upnp-org:device:HVAC_System:1\r\n' +
        '\r\n';
    
    tools.ssdpScan(ip, text, true, 500, (err, result, ip, xml) => {
        if (xml && xml.indexOf('loxone') !== -1) {
            const portArr = xml.match(portRegex) || ['', '80'];
            addLoxone(ip, portArr[1], device, options, isAdded => callback && callback(null, isAdded, ip));
        } else {
            callback && callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
