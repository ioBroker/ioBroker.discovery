'use strict';
const tools = require('../tools.js');
const https = require('https');

function detect(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'proxmox');

    const name = ip + (device._name ? (' - ' + device._name) : '');

    _get('https://' + ip + ':8006/api2/json//access/ticket', 'get')
        .then(data => {
            options.log.warn('TEST: ' + JSON.stringify(data));
            if (data === 'No ticket - ') {
                options.log.debug('SUCCESS ' + data);

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

            }
            else{
                callback(null, false, ip);
            }
        });
}

function _get(url, retry) {
    if (typeof retry === 'undefined') retry = null;

    return new Promise((resolve, reject) => {
        const req = https.get(url || '', {
                rejectUnauthorized: false,
                headers: {
                    CSRFPreventionToken: '',
                    Cookie: ''
                }
        }, res => {
            const statusCode = res.statusCode;

            if (statusCode !== 200) {
                // consume response data to free up memory
                res.resume();
                if (statusCode === 401 && !retry) {
                    _get(url, true)
                        .then(data => resolve(data));
                } else {
                    reject(statusCode);
                }
            } else {
                res.setEncoding('utf8');
                let rawData = '';
                res.on('data', chunk => rawData += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(rawData))
                    } catch (e) {
                        reject('Cannot parse answer: ' + rawData);
                    }
                });
            }
        });

        req.setTimeout(500, () => {
            this.abort();
            reject('timeout');
        });
    });
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
