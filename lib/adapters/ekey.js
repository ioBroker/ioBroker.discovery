var tools = require(__dirname + '/../tools.js');
var dgram = require('dgram');

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language

    var name = ip;
    var timeout = setTimeout(function () {
        timeout = null;
        if (server) {
            server.close(function () {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            });
        }
    }, 500);
    var browse = new Buffer([0x01, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18]);

    var server = dgram.createSocket({type: 'udp4', reuseAddr: true});

    server.on('listening', function () {
        server.setBroadcast(true);
        var port = server.address().port;
        setImmediate(function () {
            server.send(browse, 0, browse.length, 58009, ip || '255.255.255.255');
        });
    });

    server.on('error', function (error) {
        adapter.log.error(error);
    });

    server.on('message', function (msg, remote) {
        console.log(remote.address + ':' + remote.port + ' - ' + msg);

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        server.close(function () {
            var instance;
            var fromOldInstances = false;
            for (var j = 0; j < options.newInstances.length; j++) {
                if (options.newInstances[j].common && options.newInstances[j].common.name === 'ping') {
                    instance = options.newInstances[j];
                    break;
                }
            }
            if (!instance) {
                for (var i = 0; i < options.existingInstances.length; i++) {
                    if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'ping') {
                        instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                        fromOldInstances = true;
                        break;
                    }
                }
            }
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('ekey', options),
                    common: {
                        name: 'ekey',
                        title: 'ekey (' + name + ')'
                    },
                    native: {
                        devices: []
                    },
                    comment: {
                        add: []
                    }
                };
                options.newInstances.push(instance);
            } else {
                instance.native = instance.native || {};
                instance.native.devices = instance.native.devices || [];
            }

            if (!instance.native.devices.find(function (dev) { return dev.ip === ip})) {
                instance.native.devices.push({ip: ip, protocol: 'home'});
                if (fromOldInstances) {
                    options.newInstances.push(instance);
                    instance.comment = instance.comment || {};
                }
                if (instance.comment.ack) instance.comment.ack = false;

                if (!instance.comment.add) {
                    instance.comment.extended = instance.comment.extended || [];
                    instance.comment.extended.push(device._name || ip);
                } else {
                    instance.comment.add.push(device._name || ip);
                }
            }

            if (callback) {
                callback(null, !instance, ip);
                callback = null;
            }
        });
    });

    server.bind();
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks
exports.timeout = 600;