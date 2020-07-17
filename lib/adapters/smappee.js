'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, native, callback) {
    let instance = tools.findInstance(options, 'smappee', obj => obj.native.ip === ip || obj.native.ip === device._name);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('smappee', options),
            common: {
                name: 'smappee',
                title: 'smappee (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
            },
            native: {
                host: ip
            },
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback && callback(null, true, ip);
    } else {
        callback && callback(null, false, ip);
    } // endElse
} // endAddSonnen

function detect(ip, device, options, callback) {
    tools.httpGet('http://' + ip + '/smappee.html', (err, data) => {
        if (err && !data) {
            callback && callback(null, false, ip);
            callback = null;
        } else if (data) {
            if (data.includes('>Smappee')) {
                addInstance(ip, device, options, {
                    ip
                }, callback);
            } else {
                callback && callback(null, false, ip);
                callback = null;
            }
        } else {
            callback && callback(null, false, ip);
            callback = null;
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
