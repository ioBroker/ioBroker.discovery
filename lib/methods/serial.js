'use strict';

function listPorts(self) { 
    let SerialPort;
    const fs = require('fs');
    
    if (process.platform.match(/^win/)) {
        try {
            SerialPort = require('serialport');
        } catch (e) {
            self.adapter.log.warn('Cannot load serialport module');
        }
    }
    
    const list = [];
    let wait = false;
    if (SerialPort) {
        wait = true;
        SerialPort.list(function (err, ports) {
            ports.forEach(function (port) {
                let found = false;
                for (let f = 0; f < list.length; f++) {
                    if (list[f]._addr === port.comName) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const device = {
                        _addr: port.comName,
                        _name: port.manufacturer,
                        _data: port
                    };
                    list.push(device);
                    self.addDevice(device);
                }
            });
            self.done();
        });
    } else if (fs.existsSync('/dev/')) {
        try {
            const names = fs.readdirSync('/dev/');
            for (let n = 0; n < names.length; n++) {
                if (names[n].match(/^tty[A-Z]/) || names[n].match(/usb/i)) {
                    let found = false;
                    for (let f = 0; f < list.length; f++) {
                        if (list[f]._addr === names[n]) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        const device = {
                            _addr: '/dev/' + names[n],
                            _name: names[n]
                        };
                        list.push(device);
                        self.addDevice(device);
                    }
                }
            }
        } catch (e) {
            self.adapter.log.warn('Some error by list of /dev/: ' + e);
        }
    }
    
    if (!wait) {
        self.done();
    }
}


exports.browse = listPorts;
exports.type = 'serial';
exports.source = 'serial';

exports.options = { };