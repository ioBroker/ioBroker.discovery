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
    var baudRates = [57600];
    tools.testSerialPort(comName, {log: options.log}, baudRates, function onOpen(port, callback) {
        try {
            options.log.warn('write: ' + '10;VERSION;');
            port.write('10;VERSION;');
            port.drain();
        } catch (e) {
            options.log.warn('Cannot write to port: ' + e);
            return callback(e);
        }
        callback();
    }, function onAnswer(port, data, callback) {
        options.log.warn('Received: ' + data);
        // expected 20;99;"RFLink Gateway software version";
        var text = data ? data.toString() : '';
        callback(null, data.indexOf('RadioFrequencyLink') !== -1, true); // todo return here version of FW
    }, function (err, found, name, baudRate, version) {
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
                        add: ['RFLink USB ' + (version ? version + ' ' + tools.translate(options.language, 'on %s', comName) : ' - ' + comName)]
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
