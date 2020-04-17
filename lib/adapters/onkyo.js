'use strict';
const tools = require('../tools.js');

function addInstance(type, result, options, cb){
    let instance = tools.findInstance(options, 'onkyo', obj => obj.native.avrAddress === result.host);
    if (!instance){
        const id = tools.getNextInstanceID('onkyo', options);
        type = type.toUpperCase();
        instance = {
            _id:        id, common: {
                name: 'onkyo', enabled: true, title: obj => obj.common.title
            }, comment: {
                add: [type + ' ' + result.model, result.host]
            }
        };
        options.newInstances.push(instance);
        instance.native = {
            'avrAddress': result.host, 'avrPort': result.port, 'maxvolzone1': 40, 'maxvolzone2': 40
        };
        cb && cb(true);
    } else {
        cb && cb(false);
    }
}

function detect(ip, device, options, callback){
    function cb(err, is, ip){
        if (callback) {
            callback(err, is, ip);
            callback = null;
        }
    }

    let onkyoPacket   = Buffer.from([73, 83, 67, 80, 0, 0, 0, 16, 0, 0, 0, 11, 1, 0, 0, 0, 33, 120, 69, 67, 78, 81, 83, 84, 78, 13, 10]);
    let pioneerPacket = Buffer.from([73, 83, 67, 80, 0, 0, 0, 16, 0, 0, 0, 11, 1, 0, 0, 0, 33, 112, 69, 67, 78, 81, 84, 83, 78, 13, 10]);

    tools.udpScan(ip, 60128, '0.0.0.0', 1235, onkyoPacket, 5000, (err, data, remote) => {
        if (!err && data && remote){
            const type = 'onkyo';
            const message = data.toString().slice(18, data.length - 6);
            const command = message.slice(0, 3);
            let _data;
            if (command === 'ECN') {
                _data = message.slice(3).split('/');
                const result = {
                    host: remote.address, port: _data[1], model: _data[0]
                };
                addInstance(type, result, options, state => {
                    if (state) {
                        cb(null, true, ip);
                    } else {
                        cb(null, false, ip);
                    }
                });
            } else {
                cb(null, false, ip);
            }
        } else {
            err && options.log.warn('Onkyo AVR discovery error ' + err);
            cb(null, false, ip);
        }
    });

    tools.udpScan(ip, 60128, '0.0.0.0', 1237, pioneerPacket, 5000, (err, data, remote) => {
        if (!err && data && remote) {
            const type = 'pioneer';
            const message = data.toString().slice(18, data.length - 6);
            const command = message.slice(0, 3);
            let _data;

            if (command === 'ECN') {
                _data = message.slice(3).split('/');
                const result = {
                    host: remote.address, port: _data[1], model: _data[0]
                };
                addInstance(type, result, options, state => {
                    if (state){
                        cb(null, true, ip);
                    } else {
                        cb(null, false, ip);
                    }
                });
            } else {
                cb(null, false, ip);
            }
        } else {
            err && options.log.warn('Pioneer AVR discovery error ' + err);
            cb(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = 5000;
