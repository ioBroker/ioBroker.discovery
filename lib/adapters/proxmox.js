'use strict';
const tools = require('../tools.js');
const https = require('https');
const url = require('url');

function detect(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'proxmox');

    const name = ip + (device._name ? (' - ' + device._name) : '');

    _get(`https://${ip}:8006/api2/json/access/ticket`)
        .then(data => {
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
        }).catch(e => {
            callback(null, false, ip);
        });
}

function _get(uri, retry) {
    if (typeof retry === 'undefined') retry = null;

    return new Promise((resolve, reject) => {
        const urlParsed = url.parse(uri);
        const options = {
            hostname: urlParsed.hostname,
            port: urlParsed.port,
            path: urlParsed.path,
            method: 'GET',
            rejectUnauthorized: false,
            headers: {
                CSRFPreventionToken: '',
                Cookie: ''
            }
        };

        try {
            const req = https.get(options, res => {
                const statusCode = res.statusCode;

                if (statusCode !== 200) {
                    // consume response data to free up memory
                    res.resume();
                    if (statusCode === 401 && !retry) {
                        _get(uri, true)
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
                req.abort();
                reject('timeout');
            });
            req.on('error', e => {
                reject(e);
            });
        } catch (e) {
            reject(e);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
