'use strict';

const tools = require('../tools.js');
const http = require('http');
const adapterName = 'kecontact';
const urlWallbox = '/status.shtml';

function addInstance(ip, device, options, native, callback) {
    let instance = tools.findInstance (options, adapterName, obj => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: 'Keba KeContact P30 (' + ip + ')'
            },
            native: {
                host: ip
            },
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
        return true;
    } 
    return false;
}

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') {
        return callback(null, false, ip);
    }
    tools.httpGet('http://' + ip + urlWallbox, (err, data) => {
        if (!err && data && (data.indexOf("<title>KeContact") > 0) && (data.indexOf("<!--# SerNo -->") > 0)) {
            if (addInstance(ip, device, options, {ip}, callback)) {
                return;
            }
        }
        callback(null, false, ip);
    }).on('error', e => {
        callback(null, false, ip);
   });
}

exports.detect = detect;
exports.type = ['ip'];