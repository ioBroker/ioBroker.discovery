'use strict';

const tools = require('../tools.js');

function addInstance(data, options, callback) {
    let ip = data.Address;
    if(ip.indexOf("//") !== -1)
        ip = ip.substr(ip.lastIndexOf('/')+1);

    let instance = {
        _id: tools.getNextInstanceID('emby', options),
        common: {
            name: 'emby',
            title: 'Emby (' + data.Name + ')'
        },
        native: {
            ip: ip,
            deviceIds: "",
            timeout: 1500
        },
        comment: {
            add: data.Name + " (" + ip + ")",
            inputs: [
                {
                    name: 'native.apiKey',
                    def: '',
                    type: 'text', // text, checkbox, number, select, password. Select requires
                    title: 'Key' // see translation in words.js
                }
            ]
        }
    };
    options.newInstances.push(instance);
    callback(null, true, ip);
} // endAddSonnen

function detect(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'emby', obj => obj.native.ip === ip + ":8096");

    if(!instance) {
        tools.udpScan(ip, 7359, "0.0.0.0", 1234, "who is EmbyServer?", 1500, (err, data) => {
            if(!err) {
                addInstance(JSON.parse(data), options, callback);
            } else {
                options.log.error("emby error " + err);
                callback(null, false, ip);
            }
        });
    } else {
        callback(null, true, ip);
    }

    
} // endDetect

exports.detect = detect;
exports.type = ['udp']; // TODO make to once and upd lookup
exports.timeout = 1500;
