'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');
const adapterName = 'kecontact';
const DEFAULT_UDP_PORT = 7090;
const BROADCAST_UDP_PORT = 7092;
const DETECT_MESSAGE = new Buffer("i");
const KEBA_TIMEOUT = 500;
var socket = null;
var timeout = null;

function addInstance(ip, device, options) {
    let instance = tools.findInstance (options, adapterName, obj => obj.native.host === ip);
    if (instance) {
        options.log.info('Keba KeContact adapter already present for IP ' + ip);
    } else {
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
                add: ["control your Keba KeContact P30 charging station"]
            }
        };
        options.newInstances.push(instance);
        return true;
    } 
    return false;
}

function detect(ip, device, options, callback) {
    options.log.debug('Detecting Keba KeContact wallbox on ' + ip + '...');

    timeout = setTimeout(() => {
        options.log.debug('Keba timeout reached');
        timeout = null;
        cleanup(ip, callback, false);
        callback = null;
    }, KEBA_TIMEOUT);

    socket = dgram.createSocket('udp4');
    socket.on('error', (err) => {
        if (err.message.includes('EADDRINUSE')) {
            options.log.info('Keba adapter already running');
        } else {
            options.log.error(`Keba rxSocket error:${err.stack}`);
        }
        cleanup(ip, callback, false);
        callback = null;
    });

    socket.on('listening', function () {
        var address = socket.address();
        options.log.debug('Keba UDP server listening on ' + address.address + ":" + address.port);
        socket.setBroadcast(true);
        socket.send(DETECT_MESSAGE, 0, DETECT_MESSAGE.length, DEFAULT_UDP_PORT, ip, (err, bytes) => err && options.log.warn('Error from KeContact: ' + err));
    });

    socket.on('message', (message, remote) => {
        options.log.debug('UDP datagram from ' + remote.address + ':' + remote.port + ': "' + message + '"');
        if (message.equals(DETECT_MESSAGE)) {
            options.log.debug('broadcast message received by myself ...');
            return; 
        }

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        if (message.length > 0) {
            // no defined response needed regarding Keba docs
            cleanup(ip, callback, addInstance(remote.address, device, options));
            callback = null;
        } else {
            cleanup(ip, callback, false);
            callback = null;
        }
    
    });
    socket.bind(DEFAULT_UDP_PORT);
}

function cleanup(ip, callback, callbackResult) {
    if (socket) { 
        socket.close(() => {
            if (callback) {
                callback(null, callbackResult, ip);
            }
        });
        socket = null;
    }
}

exports.detect = detect;
exports.type = ['ip'];     // normally detection should wok with UDP, but charging station isn't responding on broadcast messages, only on concrete IP
exports.timeout = KEBA_TIMEOUT;