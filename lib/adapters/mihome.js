'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

function listen(ip, cb) {
    let timer = null;
    let socket;
    try {
        socket = dgram.createSocket('udp4');

        socket.on('message', msgBuffer => {
            let msg;
            try {
                msg = JSON.parse(msgBuffer.toString());
            }
            catch (e) {
                return;
            }

            if (msg.model === 'gateway') {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
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
            const whoIsCommand = '{"cmd": "whois"}';
            socket.send(whoIsCommand, 0, whoIsCommand.length, 4321, ip);
        });
        socket.bind(19898);
    } catch (e) {
        if (cb) {
            cb(e);
            cb = null;
            return;
        }
    }

    timer = setTimeout(() => {
        socket && socket.close();
        timer = null;
        if (cb) {
            cb();
            cb = null;
        }
    }, 500);
}

function addInstance(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'mihome');

    if (!instance) {
        const id = tools.getNextInstanceID('mihome', options);
        instance = {
            _id: id,
            common: {
                name: 'mihome'
            },
            native: {
                bind: tools.getOwnAddress(ip)
            },
            comment: {
                add: 'Xiaomi Mi Home - ' + ip,
                inputs: [
                    {
                        name: 'native.key',
                        def: '',
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'Key' // see translation in words.js
                    },
                    {
                        def: 'https://github.com/ioBroker/ioBroker.mihome#requirements',
                        type: 'link',
                        title: tools.translate(options.language, 'See description of key here ') // see translation in words.js
                    }
                ]
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
        listen(ip, (err, ipAddr) => {
			if (!err && ipAddr) {
                addInstance (ipAddr, device, options, isAdded => cb(null, isAdded, ip));
			} else {
                err && options.log.warn('Mihome err: ' + err);
                cb (null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip'];
