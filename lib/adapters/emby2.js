'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'emby', obj => obj.native.ip === ip + ":8096");

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('emby', options),
            common: {
                name: 'emby',
                title: 'Emby (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
            },
            native: {
                ip: ip + ":8096",
                apiKey: "",
                deviceIds: "",
                timeout: 1500
            },
            comment: {
                add: "Multimedia Server (" + ip + ")"
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    } // endElse
} // endAddSonnen

function detect(ip, device, options, callback) {
    tools.udpScan("255.255.255.255", 7359, "0.0.0.0", 1234, "who is EmbyServer?", 2000, (err, data) => {
        options.log.debug(err);
        options.log.debug(data);
        options.log.debug(ip);

        callback(null, false, ip);
    });
} // endDetect

exports.detect = detect;
exports.type = ['once']; // TODO make to once and upd lookup
exports.timeout = 1500;
