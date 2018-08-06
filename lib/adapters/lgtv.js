'use strict';

var tools = require(__dirname + '/../tools.js');
var dgram = require('dgram');

function addInstance(ip, device, options, callback) {

    var instance = tools.findInstance(options, 'lgtv', function (obj) {
        return obj.native.ip === ip;
    });

    if (!instance) {
        var id = tools.getNextInstanceID('lgtv', options);
        instance = {
            _id: id,
            common: {
                name: 'lgtv'
            },
            native: {
                ip: ip
            },
            comment: {
                add: 'LG WebOS TV - ' + ip
            }
        };
        options.newInstances.push(instance);
        return callback(true);
    }
    callback(false);
}

function _sendSsdpDiscover(socket) {
    var ssdp_rhost = '239.255.255.250';
    var ssdp_rport = 1900;
    var ssdp_msg = 'M-SEARCH * HTTP/1.1\r\n';
    ssdp_msg += 'HOST: 239.255.255.250:1900\r\n';
    ssdp_msg += 'MAN: "ssdp:discover"\r\n';
    ssdp_msg += 'MX: 30\r\n';
    ssdp_msg += 'ST: urn:lge-com:service:webos-second-screen:1\r\n';
    ssdp_msg += 'USER-AGENT: iOS/5.0 UDAP/2.0 iPhone/4\r\n\r\n';
    var message = new Buffer(ssdp_msg);
    socket.send(message, 0, message.length, ssdp_rport, ssdp_rhost, function (err, bytes) {
        if (err) throw err;
    });
}

function discoverIp(retryTimeoutSeconds, tvIpFoundCallback) {
    var server = dgram.createSocket('udp4');
    var timer;

    if (typeof retryTimeoutSeconds  === 'function') {
        tvIpFoundCallback   = retryTimeoutSeconds;
        retryTimeoutSeconds = 1500;
    }

    server.on('listening', function () {
        _sendSsdpDiscover(server);
    });

    server.on('error', function (error) {
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

    server.on('message', function (message, remote) {
        if (message.indexOf('LGE WebOS TV') !== -1) {
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

    timer = setTimeout(function () {
        try {
            server.close();
        } catch (e) {

        }

        timer = null;
        if (tvIpFoundCallback) {
            tvIpFoundCallback('timeout');
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
        var retryTimeout = 1500;
        discoverIp(retryTimeout, function (err, ipAddr) {
            if (!err) {
                return addInstance(ipAddr, device, options, function (isAdded) {
                    cb(null, isAdded, ip);
                });
            } else {
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
