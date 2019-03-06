'use strict';
const tools = require('../tools.js');
const https = require('https');
const url = require('url');

function detect(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'proxmox');

    const name = ip + (device._name ? (' - ' + device._name) : '');

    tools.httpGet('http://' + ip + ':8096/Users', (err, data) => {
        data = JSON.stringify(data);
        if (data === '{"data":null}') {
            if (!instance) {
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
            }
            callback(null, true, ip);
        } else{
            callback(null, false, ip);
        }
    });
}



exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
