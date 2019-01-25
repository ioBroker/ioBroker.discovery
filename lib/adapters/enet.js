'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

function addInstance(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'enet', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('enet', options);
        instance = {
            _id: id,
            common: {
                name: 'enet'
            },
            native: {
                ip: ip
            },
            comment: {
                add: 'eNet device - ' + ip
            }
        };
        options.newInstances.push(instance);
        return callback(true);
    }
    callback(false);
}

function _sendSsdpDiscover(socket) {
    const ssdp_rhost = '239.255.255.250';
    const ssdp_rport = 1900;
    let ssdp_msg = 'M-SEARCH * HTTP/1.1\r\n';
    ssdp_msg += 'HOST: 239.255.255.250:1900\r\n';
    ssdp_msg += 'MAN: "ssdp:discover"\r\n';
    ssdp_msg += 'MX: 5\r\n';
    ssdp_msg += 'ST: upnp-rootdevice\r\n';
    ssdp_msg += 'USER-AGENT: iOS/5.0 UDAP/2.0 iPhone/4\r\n\r\n';
    const message = new Buffer(ssdp_msg);
    socket.send(message, 0, message.length, ssdp_rport, ssdp_rhost, (err, bytes) => {
        if (err) throw err;
    });
}

function discoverIp(retryTimeoutSeconds, tvIpFoundCallback) {
    const server = dgram.createSocket('udp4');
    let timer;

    if (typeof retryTimeoutSeconds  === 'function') {
        tvIpFoundCallback   = retryTimeoutSeconds;
        retryTimeoutSeconds = 1500;
    }

    server.on('listening', () => _sendSsdpDiscover(server));

    server.on('error', error => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        try {
            server.close();
        } catch (e) {

        }
        if (tvIpFoundCallback) {
            tvIpFoundCallback(error);
            tvIpFoundCallback = null;
        }
    });

    server.on('message', (message, remote) => {
        if (message.indexOf('Albrecht Jung') !== -1) {
            try {
                server.close();
            } catch (e) {

            }
            if (tvIpFoundCallback) {
                tvIpFoundCallback(null, remote.address);
                tvIpFoundCallback = null;
            }
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }
    });

    timer = setTimeout(() => {
        try {
            server.close();
        } catch (e) {

        }

        timer = null;
        if (tvIpFoundCallback) {
            tvIpFoundCallback();
            tvIpFoundCallback = null;
        }
    }, retryTimeoutSeconds);

    server.bind();
    return server;
}

function detect(ip, device, options, callback) {
    function cb(err, is, ip) {
        if (callback) {
            callback(err, is, ip);
            callback = null;
        }
    }

    if (device._type === 'ip') {
        const retryTimeout = 1500;
        discoverIp(retryTimeout, (err, ipAddr) => {
            if (!err && ipAddr) {
                return addInstance(ipAddr, device, options, isAdded => cb(null, isAdded, ip));
            } else if (err) {
                options.log.warn('LG TV ERR: ' + err);
            }

            cb(null, false, ip);
        });
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
