'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');
const adapterName = 'kecontact';
const txSocket = dgram.createSocket('udp4');
const rxSocket = dgram.createSocket('udp4');
const DEFAULT_UDP_PORT = 7090;
const KEBA_TIMEOUT = 500;
var timeout = null;

function addInstance(ip, device, options, native, callback) {
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
    }, KEBA_TIMEOUT);

    rxSocket.on('error', (err) => {
        if (err.message.includes('EADDRINUSE')) {
            options.log.info('Keba adapter already running');
        } else {
            options.log.error(`Keba rxSocket error:${err.stack}`);
        }
        cleanup(ip, callback, false);
    });

    rxSocket.on('listening', function () {
        var address = rxSocket.address();
        options.log.debug('Keba UDP server listening on ' + address.address + ":" + address.port);
        // send connect request
        txSocket.send("i", 0, 1, DEFAULT_UDP_PORT, ip, (err, bytes) => err && options.log.warn('Error from KeContact: ' + err));
    });
    rxSocket.on('message', (message, remote) => {
        options.log.debug('UDP datagram from ' + remote.address + ':' + remote.port + ': "' + message + '"');
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        if (message.length > 0) {
            // no defined response needed regarding Keba docs
            txSocket.close(() => {
                callback(null, addInstance(ip, device, options, {ip}, callback), ip);
                callback = null;
            });
        } else {
            cleanup(ip, callback, false);
        }
    
    });
    rxSocket.bind(DEFAULT_UDP_PORT);
}

function cleanup(ip, callback, callbackResult) {
    if (txSocket) {
        if (txSocket.)
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