'use strict';

var tools = require(__dirname + '/../tools.js');
var dgram = require('dgram');

function listen(ip, cb) {
    var timer = null;
    try {
        var socket = dgram.createSocket('udp4');

        socket.on('message', function (msgBuffer) {
            try {
                var msg = JSON.parse(msgBuffer.toString());
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

        socket.on('error', function (err) {
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

        socket.on('listening', function () {
            var whoIsCommand = '{"cmd": "whois"}';
            socket.send(whoIsCommand, 0, whoIsCommand.length, 4321, ip);
        });
        socket.bind(19898);
    } catch (e) {
        if (cb) {
            cb(e);
            cb = null;
        }
    }

    timer = setTimeout(function () {
        socket.close();
        timer = null;
        if (cb) {
            cb('timeout');
            cb = null;
        }
    }, 500);
}

function addInstance(ip, device, options, callback) {

    var instance = tools.findInstance(options, 'mihome');

    if (!instance) {
        var id = tools.getNextInstanceID('mihome', options);
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
        listen(ip, function(err, ipAddr) {
			if (!err) {
                addInstance (ipAddr, device, options, function (isAdded) {
					cb (null, isAdded, ip);
                });
			} else {
			    options.log.warn('Mihome err: ' + err);
                cb (null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip'];
