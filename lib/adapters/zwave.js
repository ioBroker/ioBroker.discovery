var tools = require(__dirname + '/../tools.js');

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
    var baudRates = [115200]; // detect aeon labs
    tools.testSerialPort(comName, null, baudRates, function onOpen(port, callback) {
        try {
            port.write(new Buffer([0x01, 0x03, 0x00, 0x15, 0xe9]));
            port.drain();
        } catch (e) {
            options.log.warn('Cannot write to port: ' + e);
            return callback(e);
        }
        callback();
    }, function onAnswer(port, data, callback) {
        // Expected 0x01, 0x10, 0x01, 0x15, 0x5a, 0x2d, 0x57, 0x61, 0x76, 0x65, 0x20, 0x33, 0x2e, 0x39, 0x35, 0x00, 0x01, 0x99
        var j = 0;
        var version = '';
        if (data.length > 10 && data.length < 100) {
            while (data[j] !== 1 && j < data.length && j < 100) j++;
            if (data[j + 1] === 0x10 && data[j + 2] === 0x01 && data[j + 3] === 0x15) {
                j += 4;
                while (data[j] && j < data.length && j < 100) version += String.fromCharCode(data[j++]);
                if (version.indexOf('Z-Wave') !== -1) {
                    options.log.info('Found ZWave on "' + comName + '": ' + version);
                    callback(null, true, true, version);
                    return;
                }
            }
        }
        callback(null, false, true);
    }, function (err, found, name, baudRate, someInfo) {
        if (found) {
            var instance = tools.findInstance(options, 'zwave', function (obj) {
                return obj.native.comName === name;
            });
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('zwave', options),
                    common: {
                        name: 'zwave',
                        title: 'ZWave (' + comName + (device._name && device._name !== comName ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        usb:  name
                    },
                    comment: {
                        add: [someInfo ? someInfo + ' ' + tools.translate(options.language, 'on %s', comName) : 'ZWave USB - ' + comName]
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
exports.type = ['serial'];// make type=serial for USB sticks
