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
var utils    = require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter  = new utils.Adapter('discover');
var fs       = require('fs');
var adapters = null;
var methods  = null;
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
function analyseDevice(device, options, callback) {
    var count = 0;

    adapter.log.debug('Test ' + device._addr);
    
    var a;

    // try all found adapter types (first without dependencies)
    for (a in adapters) {
        if (!adapters.hasOwnProperty(a)) continue;
        if (adapters[a].type !== device._type) continue;
        if (adapters[a].dependencies) continue;

        count++;
        (function (adpr) {
            adapter.log.debug('Test ' + device._addr + ' ' + adpr);

            // expected, that detect method will add to _instances one instance of specific type or extend existing one
            adapters[a].detect(device._addr, device, options, function (err, isFound, addr) {
                if (isFound) {
                    adapter.log.debug('Test ' + device._addr + ' ' + adpr + ' DETECTED!');
                }
                if (!--count) callback(err);
            })
        })(a);
    }

    // try all found adapter types (with dependencies)
    for (a in adapters) {
        if (!adapters.hasOwnProperty(a)) continue;
        if (adapters[a].type !== device._type) continue;
        if (!adapters[a].dependencies) continue;

        count++;
        (function (adpr) {
            adapter.log.debug('Test ' + device._addr + ' ' + adpr);

            // expected, that detect method will add to _instances one instance of specific type or extend existing one
            adapters[a].detect(device._addr, device, options, function (err, isFound, addr) {
                if (isFound) {
                    adapter.log.debug('Test ' + device._addr + ' ' + adpr + ' DETECTED!');
                }
                if (!--count) callback(err);
            })
        })(a);
    }

    if (!count) callback(null);
}

function analyseDevices(devices, options, index, callback) {
    if (typeof index === 'function') {
        index = callback;
        index = 0;
    }

    if (!devices || index >= devices.length) {
        callback(null);
        return;
    }

    analyseDevice(devices[index], options, function (err) {
        if (err) adapter.log.error('Error by analyse device: ' + err);
        setTimeout(analyseDevices, 0, devices, options, index + 1, callback);
    });
}

function getInstances(callback) {
    socket.emit('getObjectView', 'system', 'instance', {startkey: 'system.adapter.', endkey: 'system.adapter.\u9999'}, function (err, doc) {
        if (err) {
            if (callback) callback ([]);
        } else {
            if (doc.rows.length === 0) {
                if (callback) callback ([]);
            } else {
                var res = [];
                for (var i = 0; i < doc.rows.length; i++) {
                    res.push(doc.rows[i].value);
                }
                if (callback) callback (res);
            }
        }
    });
}

function discoveryEnd(devices, callback) {
    adapter.log.info('Found ' + devices.length + ' addresses');

    // analyse every IP address
    if (!adapters) enumAdapters();

    getInstances(function (instances) {
        var options = {
            existingInstances: instances,
            newInstances: []
        };
        analyseDevices(devices, options, 0, function (err) {
            adapter.log.info('Discovery finished. Found new or modified ' + options.newInstances.length + ' instances');

            if (typeof callback === 'function') callback(null, devices, options.newInstances);
            
            // add this information to system.discovery.host
            /*adapter.getForeignObject('system.discovery', function (err, obj) {
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
            });*/
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
