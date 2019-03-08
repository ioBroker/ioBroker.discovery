'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

function listen(ip, cb) {
    tools.udpScan("224.0.0.50", 4321, "0.0.0.0", 9898, '{"cmd": "whois"}', 500, (err, msg) => {
        options.log.debug(msg);
        msg = JSON.parse(msg);

        if (msg.model && msg.model === 'gateway') {
            options.log.debug("mihome: " + ip);
            options.log.debug("mihome: " + JSON.stringify(msg));
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
}

function addInstance(ip, device, options, callback) {
    options.log.debug("mihome: found one");
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
    options.log.debug("testing " + ip + ": " + JSON.stringify(device));

    function cb(err, is, ip) {
        if (callback) {
            callback(err, is, ip);
            callback = null;
        }
    }

    if (device._type === 'ip') {
        listen(ip, (err, ipAddr) => {
			if (!err && ipAddr) {
                options.log.debug("mihome: found one");
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
exports.type = ['udp']; // TODO check if udp
exports.timeout = 500;