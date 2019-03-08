'use strict';

const tools = require('../tools.js');

function addInstance(data, options, callback) {
    let ip = data.Address;
    if(ip.indexOf("//") !== -1)
        ip = ip.substr(ip.lastIndexOf('/')+1);

    let instance = tools.findInstance(options, 'emby', obj => obj.native.ip === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('emby', options),
            common: {
                name: 'emby',
                title: 'Emby (' + data.Name + ')'
            },
            native: {
                ip: ip,
                apiKey: "",
                deviceIds: "",
                timeout: 1500
            },
            comment: {
                add: data.Name + " (" + ip + ")"
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    } // endElse
} // endAddSonnen

function detect(ip, device, options, callback) {
    tools.udpScan(ip, 7359, "0.0.0.0", 1234, "who is EmbyServer?", 1500, (err, data) => {
        if(!err) {
            addInstance(JSON.parse(data), options, callback);
        } else {
            options.log.error("emby error " + err);
            callback(null, false, ip);
        }
    });
} // endDetect

exports.detect = detect;
exports.type = ['udp']; // TODO make to once and upd lookup
exports.timeout = 1500;
