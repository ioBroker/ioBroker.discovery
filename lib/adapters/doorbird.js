'use strict';

const tools = require('../tools.js');
const http = require('http');

function addInstance(ip, device, options, native, callback) {
    let instance = tools.findInstance(options, 'doorbird', obj => obj.native.birdip === ip);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('doorbird', options),
            common: {
                name: 'doorbird',
                title: 'DoorBird (' + ip + ')'
            },
            native: {
                birdip: ip
            },
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    }
}

function detect(ip, device, options, callback) {
    http.get('http://' + ip + '/bha-api/info.cgi', function (res) {
        if (res.headers['www-authenticate']) {
            if (res.headers['www-authenticate'].indexOf('DoorBird') !== -1) {
                addInstance(ip, device, options, { ip }, callback);
            }
        }
    }).on('error', function (e) {
        if (callback) {
            return callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;