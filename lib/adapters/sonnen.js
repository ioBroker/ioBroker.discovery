'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, native, callback) {
    let instance = tools.findInstance(options, 'sonnen', obj => obj.native.ip === ip || obj.native.ip === device._name);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('sonnen', options),
            common: {
                name: 'sonnen',
                title: 'sonnen (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
            },
            native: native,
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    } // endElse
} // endAddSonnen

function detect(ip, device, options, callback) {
    adapter.log.debug('Sonnen search');
    tools.httpGet('http://' + ip + ':8080/api/v1/status', (err, data) => {
        if (err) {
            if (callback) {
                return callback(null, false, ip);
            } // endIf
        } else {
            let testData;
            try {
                testData = JSON.parse(data);
            } catch (e) {
                testData = null;
            }
            if (testData && testData.hasOwnProperty('GridFeedIn_W')) {
                addInstance(ip, device, options, {ip}, callback);
            } else if (callback) {
                return callback(null, false, ip);
            } // endElse

        } // endElse

    });
} // endDetect

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;