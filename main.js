/**
 *
 *      ioBroker Discover Adapter
 *
 *      (c) 2017 bluefox<dogafox@gmail.com>
 *
 *      MIT License
 *
 */
/* jshint -W097 */
/* jshint strict:false */
/* jslint node: true */
'use strict';
var utils   = require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = new utils.Adapter('discover');
var fs      = require('fs');
var adapters = null;
var methods = null;
function enumAdapters() {
    var dir = fs.readdirSync(__dirname + '/lib/adapters');
    adapters = {};
    for (var f = 0; f < dir.length; f++) {
        var parts = dir[f].split('.');
        if (parts[parts.length - 1] === 'js') {
            parts.pop();
            adapters[parts.join('.')] = require(__dirname + '/lib/adapters/' + dir[f]);
        }
    }
}

function enumMethods() {
    var dir = fs.readdirSync(__dirname + '/lib/methods');
    methods = {};
    for (var f = 0; f < dir.length; f++) {
        var parts = dir[f].split('.');
        if (parts[parts.length - 1] === 'js') {
            parts.pop();
            methods[parts.join('.')] = require(__dirname + '/lib/methods/' + dir[f]);
        }
    }
}

var isStopping = false;
var isRunning = false;

adapter.on('message', function (obj) {
    if (obj) processMessage(obj);
    processMessages();
});

adapter.on('ready', function () {
    main();
});

adapter.on('unload', function (callback) {
    if (isRunning) {
        isStopping = true;
        setTimeout(function () {
            if (callback) {
                callback();
            }
        }, 1000);
    } else if (callback) {
        callback();
    }
});

function processMessage(obj) {
    if (!obj || !obj.command) return;
    switch (obj.command) {
        case 'browse': {
            if (obj.callback && obj.message) {
                browse(obj.message, function (err, devices, foundAdapters) {
                    adapter.sendTo(obj.from, obj.command, {
                        devices: devices,
                        foundAdapters: foundAdapters
                    }, obj.callback);
                });
            }
            break;
        }
    }
}

function processMessages() {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            processMessage(obj.command, obj.message);
            processMessages();
        }
    });
}

// addr can be IP address (192.168.1.1) or serial port name (/dev/ttyUSB0, COM1)
function analyseDevice(device, callback) {
    var count = 0;

    adapter.log.debug('Test ' + device._addr);
    // try all found adapter types
    for (var a in adapters) {
        if (!adapters.hasOwnProperty(a)) continue;
        if (adapters[a].type !== device._type) continue;

        count++;
        (function (adp) {
            adapter.log.debug('Test ' + device._addr + ' ' + adp);
            adapters[a].detect(device._addr, device, function (err, _result, addr) {
                if (_result) {
                    adapter.log.debug('Test ' + device._addr + ' ' + adp + ' DETECTED!');
                    device[adp] = _result;
                }
                if (!--count) callback(err, device, addr);
            })
        })(a);
    }
    if (!count) callback(null, result, addr);
}

function analyseDevices(devices, index, callback) {
    if (typeof index === 'function') {
        index = callback;
        index = 0;
    }

    if (!devices || index >= devices.length) {
        callback(null);
        return;
    }
    analyseDevice(devices[index], function (err) {
        setTimeout(analyseDevices, 0, devices, index + 1, callback);
    });
}

function discoveryEnd(devices, callback) {
    adapter.log.info('Found ' + devices.length + ' addresses');

    // analyse every IP address
    if (!adapters) enumAdapters();

    analyseDevices(devices, 0, function (err) {
        // add this information to system.discovery.host
        adapter.getForeignObject('system.discovery', function (err, obj) {
            if (!obj) {
                obj = {
                    common: {
                        name: 'Information about found devices'
                    },
                    native: {},
                    type: 'config'
                }
            }

            obj.native.possibleAdapters = [];

            for (var i = 0; i < devices.length; i++) {
                for (var a in devices[i]) {
                    if (devices[i].hasOwnProperty(a) && a[0] !== '_' && obj.native.possibleAdapters.indexOf(a) === -1) {
                        obj.native.possibleAdapters.push(a);
                    }
                }
            }

            obj.native.possibleAdapters.sort();
            obj.native.devices = devices;

            adapter.setForeignObject('system.discovery', obj, function (err) {
                isRunning = false;
                if (err) adapter.log.error('Cannot update system.discovery: ' + err);
                adapter.log.info('Discovery finished');
                if (typeof callback === 'function') callback(null, devices, obj.native.possibleAdapters);
            });
        });
    });
}

var timeoutProgress;
function updateFindProgress(progress) {
    if (timeoutProgress) return;
    timeoutProgress = setTimeout(function () {
        timeoutProgress = null;
        var count = 0;
        var value = 0;
        for (var p in progress) {
            count++;
            value += progress[p];
        }
        adapter.setState('devicesProgress', Math.round(value / count * 100) / 100, true);
    }, 1000)
}

function browse(options, callback) {
    if (isRunning) {
        if (callback) callback('Yet running');
        return;
    }
    isRunning = true;
    enumMethods();

    var count = 0;
    var result = [];
    var progress = [];
    for (var m in methods) {
        if (!methods.hasOwnProperty(m) || !methods[m].browse) continue;
        if (options && options.indexOf(m) === -1) continue;

        count++;
        progress[m] = 0;
        methods[m].browse(adapter.config, adapter.log, function (name, _progress) {
                adapter.log.debug(name + ': ' + _progress + '%');
                progress[name] = _progress;
                updateFindProgress(progress);
            },
            function (err, _result, source) {
                if (_result) {
                    for (var r = 0; r < _result.length; r++) {
                        _result[r]._source = source;
                        _result[r]._type = methods[m].type;
                    }
                    result = result.concat(_result);
                }
                if (!--count) discoveryEnd(result, callback);
            });
    }
    if (!count) discoveryEnd(result, callback);
}

function main() {
    adapter.config.pingTimeout = parseInt(adapter.config.pingTimeout, 10) || 1000;
    adapter.config.pingBlock  = parseInt(adapter.config.pingBlock, 10) || 20;

    browse();
}
