var tools = require(__dirname + '/../tools.js');
var SerialPort;

function testPort(name, options, baudRates, onOpen, onReceived, callback) {
    if (typeof baudRates === 'object') {
        if (!baudRates && !baudRates.length) {
            callback('not found', false, name);
        } else {
            var baudRate = baudRates.shift();
            testPort(name, options, baudRate, onOpen, onReceived, function (err, found, name, baudrate) {
                if (found) {
                    callback(null, true, name, baudrate);
                } else {
                    setTimeout(testPort, 0, name, options, baudRates, onOpen, onReceived, callback);
                }
            });
        }
    } else {
        var isOpened;
        try {
            SerialPort = SerialPort || require('serialport');

            options = options || {};
            options.autoOpen = false;
            options.baudRate = baudRate;
            options.timeout  = options.timeout || 1000;

            var port = new SerialPort(name, options);

            // the open event will always be emitted
            port.on('open', function() {
                isOpened = true;

                if (onOpen) {
                    onOpen(port, function (err) {
                        if (err) {
                            if (port && port.isOpen()) port.close();
                            port = null;
                            if (callback) callback(err, false, name, baudRate);
                            callback = null;
                        } else {
                            setTimeout(function () {
                                if (port && port.isOpen()) port.close();
                                port = null;
                                if (callback) callback('timeout', false, name, baudRate);
                                callback = null;
                            }, options.timeout);
                        }
                    });
                } else {
                    if (port.isOpen()) port.close();
                    port = null;
                    callback(null, true, name, baudRate);
                    callback = null;
                }
            });

            port.on('data', function (data) {
                if (onReceived) {
                    onReceived(port, data, function (err, found, isStop) {
                        if (err || isStop || found) {
                            if (port && port.isOpen()) port.close();
                            port = null;
                            if (callback) callback(err, found, name, baudRate);
                            callback = null;
                        }
                    });
                } else {
                    if (port && port.isOpen()) port.close();
                    port = null;
                    if (callback) callback(null, true, name, baudRate);
                    callback = null;
                }
            });

            port.on('error', function (err) {
                if (port && port.isOpen()) port.close();
                port = null;
                if (callback) callback(err, false, name, baudRate);
                callback = null;
            });

            port.open(function (err) {
                if (err) callback(err);
            });
        }
        catch(e){

        }
    }
}

function detect(comName, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }
    var baudRates = [38400];
    testPort(comName, null, baudRates, function onOpen(port, callback) {
        try {
            port.write('V');
            port.drain();
        } catch (e) {
            options.log.warn('Cannot write to port: ' + e);
            return callback(e);
        }
        callback();
    }, function onAnswer(port, data, callback) {
        callback(null, data.indexOf('V') !== -1, true);
    }, function (err, found, name, baudRate) {
        if (found) {
            var instance = tools.findInstance(options, 'rflink', function (obj) {
                return obj.native.comName === name;
            });
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('rflink', options),
                    common: {
                        name: 'rflink',
                        title: 'RFLink (' + comName + (device._name && device._name !== comName ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        comName:  name,
                        baudRate: baudRate
                    },
                    comment: {
                        add: [comName]
                    }
                };
                options.newInstances.push(instance);
                callback(null, true, comName);
            } else {
                callback(null, false, comName);
            }
        } else {
            callback(null, false, comName);
        }

    });
}

exports.detect = detect;
exports.type = ['upnp', 'ip'];// make type=serial for USB sticks
