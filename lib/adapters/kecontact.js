'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');
const adapterName = 'kecontact';
var txSocket = null;
var rxSocket = null;
const DEFAULT_UDP_PORT = 7090;
const BROADCAST_UDP_PORT = 7092;
const DETECT_MESSAGE = "report 1";
const KEBA_TIMEOUT = 500;
var timeout = null;

function addInstance(ip, device, options, native) {
    let instance = tools.findInstance (options, adapterName, obj => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: 'Keba KeContact P30 (' + ip + ')'
            },
            native: {
                host: ip
            },
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        return true;
    } 
    return false;
}

function detect(ip, device, options, callback) {

    timeout = setTimeout(() => {
        timeout = null;
        cleanup(ip, callback, false);
        callback = null;
    }, KEBA_TIMEOUT);

    rxSocket = dgram.createSocket('udp4');
    rxSocket.on('error', (err) => {
        if (err.message.includes('EADDRINUSE')) {
            options.log.info('Keba adapter already running');
        } else {
            options.log.error(`Keba rxSocket error:${err.stack}`);
        }
        cleanup(ip, callback, false);
        callback = null;
    });

    rxSocket.on('listening', function () {
        //rxSocket.setBroadcast(true);
        //rxSocket.setMulticastLoopback(true);
        var address = rxSocket.address();
        options.log.debug('Keba UDP server listening on ' + address.address + ":" + address.port);
        // send connect request
        txSocket = dgram.createSocket('udp4');
        txSocket.send(DETECT_MESSAGE, 0, DETECT_MESSAGE.length, DEFAULT_UDP_PORT, ip, (err, bytes) => err && options.log.warn('Error from KeContact: ' + err));
    });
    rxSocket.on('message', (message, remote) => {
        options.log.debug('UDP datagram from ' + remote.address + ':' + remote.port + ': "' + message + '"');
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        if (message.length > 0) {
            // no defined response needed regarding Keba docs
            cleanup(ip, callback, addInstance(ip, device, options, {ip}));
            callback = null;
        } else {
            cleanup(ip, callback, false);
            callback = null;
        }
    
    });
    rxSocket.bind(BROADCAST_UDP_PORT);
}

function cleanup(ip, callback, callbackResult) {
    if (txSocket) {
        txSocket.close();
        txSocket = null;
    }
    if (rxSocket) { 
        rxSocket.close(() => {
            if (callback) {
                callback(null, callbackResult, ip);
            }
        });
        rxSocket = null;
    }
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = KEBA_TIMEOUT;