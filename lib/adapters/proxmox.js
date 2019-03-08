'use strict';
const tools = require('../tools.js');
const https = require('https');
const url = require('url');

function detect(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'proxmox', obj => obj.native.ip === ip);

    if(!instance) {
        const name = ip + (device._name ? (' - ' + device._name) : '');

        tools.httpGet('http://' + ip + ':8006/api2/json/access/ticket', (err, data) => {
            data = JSON.stringify(data);
            options.log.debug(data);
            if (data === '{"data":null}') {
                instance = {
                    _id: tools.getNextInstanceID('proxmox', options),
                    common: {
                        name: 'proxmox',
                        enabled: true,
                        title: 'proxmox (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        ip: ip,
                        port: 8006,
                    },
                    comment: {
                        add: [name]
                    }

                };
                options.newInstances.push(instance);
                callback(null, true, ip);
            } else{
                callback(null, false, ip);
            }
        });
    } else {
        callback(null, true, ip);
    }
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
