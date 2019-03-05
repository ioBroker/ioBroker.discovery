'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'emby', obj => obj.native.ip === ip);

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
                add: "Multimedia Server"
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    } // endElse
} // endAddSonnen

function detect(ip, device, options, callback) {
    tools.httpGet('http://' + ip + ':8096/Users', (err, data) => {
        if (err) {
            if (callback) {
                return callback(null, false, ip);
            } // endIf
        } else {
            if (data == "Access token is required.") {
                addInstance(ip, device, options, callback);
            } else if (callback) {
                return callback(null, false, ip);
            } // endElse

        } // endElse

    });
} // endDetect

exports.detect = detect;
exports.type = ['ip']; // TODO make to once and upd lookup
exports.timeout = 1500;