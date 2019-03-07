'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

function browse(ip, options, cb) {
    let timer = null;
    const socket = dgram.createSocket('udp4');

    socket.on('message', (msgBuffer, rinfo) => {
        const msg = msgBuffer.toString();
        // answer is "eQ3MaxApKMD1055338>I"
        if (msg.indexOf('eQ3MaxAp') !== -1) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            options.log.error('Cannot browse: ' + err);
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

    socket.on('error', err => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        options.log.error('Cannot browse: ' + err);
        try {
            socket.close();
        } catch (e) {

        }

        if (cb) {
            cb(err);
            cb = null;
        }
    });
    socket.on('listening', () => {
        const whoIsCommand = 'eQ3Max*\0**********I';
        socket.send(whoIsCommand, 0, whoIsCommand.length, 23272, ip);
    });

    socket.bind(23275);

    timer = setTimeout(() => {
        socket.close();
        timer = null;
        if (cb) {
            cb();
            cb = null;
        }
    }, 1000);
}

function addInstance(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'maxcube', obj => obj.native.ip === ip);
    
    if (!instance) {
        const id = tools.getNextInstanceID('maxcube', options);
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
        browse(ip, options, (err, ipAddr) => {
			if (!err && ipAddr) {
                addInstance(ipAddr, device, options, isAdded => cb(null, isAdded, ip));
			} else if (err) {
			    options.log.warn('MAX! Cube err: ' + err);
                cb (null, false, ip);
            } else {
                cb (null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip']; // TODO udp
