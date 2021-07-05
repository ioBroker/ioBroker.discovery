'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');
const adapterName = 'kecontact';
const KEBA_TIMEOUT = 500;

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

    const DEFAULT_UDP_PORT =  7090;
    const server = dgram.createSocket('udp4');

    let timeout = setTimeout(() => {
        timeout = null;
        if (server) {
            server.close(() => {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            });
        }
    }, KEBA_TIMEOUT);

    server.on('listening', () => {
        const address = server.address();
        options.log.debug('UDP Server listening on ' + address.address + ":" + address.port);
        // send connect request
        server.send("i", 0, 1, DEFAULT_UDP_PORT, ip, (err, bytes) => err && options.log.warn('Error from KeContact: ' + err));
    });

    server.on('message', (message, remote) => {
        options.log.debug('UDP datagram from ' + remote.address + ':' + remote.port + ': "' + message + '"');
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        if (message.length > 0) {
            // no defined response needed regarding Keba docs
            server.close(() => {
                callback(null, addInstance(ip, device, options, {ip}, callback), ip);
                callback = null;
            });
        } else {
            server.close(() => {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            });
        }
    });

    server.bind();
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = KEBA_TIMEOUT;