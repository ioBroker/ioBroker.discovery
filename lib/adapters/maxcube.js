'use strict';

var tools = require('../tools.js');
var dgram = require('dgram');

function browse(ip, cb) {
    var timer = null;
    var socket = dgram.createSocket('udp4');

    socket.on('message', function (msgBuffer, rinfo) {
        var msg = msgBuffer.toString();
        // answer is "eQ3MaxApKMD1055338>I"
        if (msg.indexOf('eQ3MaxAp') !== -1) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            adapter.log.error('Cannot browse: ' + err);
            try {
                socket.close();
            } catch (e) {

            }

            if (cb) {
                cb(null, ip);
                cb = null;
            }
        }
    });

    socket.on('error', function (err) {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        adapter.log.error('Cannot browse: ' + err);
        try {
            socket.close();
        } catch (e) {

        }

        if (cb) {
            cb(err);
            cb = null;
        }
    });
    socket.on('listening', function () {
        var whoIsCommand = 'eQ3Max*\0**********I';
        socket.send(whoIsCommand, 0, whoIsCommand.length, 23272, ip);
    });

    socket.bind(23275);

    timer = setTimeout(function () {
        socket.close();
        timer = null;
        if (cb) {
            cb('timeout');
            cb = null;
        }
    }, 1000);
}

function addInstance(ip, device, options, callback) {

    var instance = tools.findInstance(options, 'maxcube', function (obj) {
        return obj.native.ip === ip;
    });
    
    if (!instance) {
        var id = tools.getNextInstanceID('maxcube', options);
        instance = {
            _id: id,
            common: {
                name: 'maxcube'
            },
            native: {
                ip: ip,
                bind: tools.getOwnAddress(ip)
            },
            comment: {
                add: 'MAX! Cube - ' + ip
            }
        };
        options.newInstances.push(instance);
        return callback(true);
    }
    callback(false);
}

function detect(ip, device, options, callback) {

    function cb(err, is, ip) {
        if (callback) {
            callback(err, is, ip);
            callback = null;
        }
    }

    if (device._type === 'ip') {
        browse(ip, function(err, ipAddr) {
			if (!err) {
                addInstance (ipAddr, device, options, function (isAdded) {
					cb (null, isAdded, ip);
                });
			} else {
			    options.log.warn('MAX! Cube err: ' + err);
                cb (null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip'];
