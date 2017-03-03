'use strict';

function listPorts(options, log, progressCallback, callback) {
    var SerialPort;
    var fs = require('fs');

    if (process.platform.match(/^win/)) {
        try {
            SerialPort = require('serialport');
        } catch (e) {
            log.warn('Cannot load serialport module');
        }
    }

    var list = [];
    var wait = false;
    if (SerialPort) {
        wait = true;
        SerialPort.list(function (err, ports) {
            ports.forEach(function(port) {
                var found = false;
                for (var f = 0; f < list.length; l++) {
                    if (list[f]._addr === port.comName) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    list.push({
                        _addr: port.comName,
                        _name: port.manufacturer,
                        _data: port
                    });

                }
            });
            callback(null, list, 'serial');
        });
    }

    if (fs.existsSync('/dev/')) {
        try {
            var names = fs.readdirSync('/dev/');
            for (var n = 0; n < names.length; n++) {
                if (names[n].match(/^tty[A-Z]/) || names[n].match(/usb/i)) {
                    var found = false;
                    for (var f = 0; f < list.length; l++) {
                        if (list[f]._addr === names[n]) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) list.push({
                        _addr: names[n],
                        _name: names[n]
                    });
                }
            }
        } catch (e) {
            log.warn('Some error by list of /dev/');
        }
    }

    if (!wait) callback(null, list, 'serial');
}

exports.browse = listPorts;
exports.type = 'serial';
exports.options = {

};