'use strict';
const tools = require('../tools.js');

function detect(ip, device, options, callback) {
    const name = ip + (device._name ? (' - ' + device._name) : '');

    tools.httpGet('https://' + ip + ':8006/api2/json/access/ticket',  (err, data) => {
        data = JSON.stringify(data);
        if (data === '{"data":null}' || err == "unable to verify the first certificate") {
            let instance = tools.findInstance(options, 'proxmox', obj => obj.native.ip === ip);

            if(!instance) {
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
