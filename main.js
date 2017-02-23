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
var adapter  = new utils.Adapter('discovery');
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
            if (obj.callback) {
                adapter.log.info('Received "browse" event');
                browse(obj.message, function (err, newInstances, devices) {
                    adapter.log.info('Browse finished');
                    adapter.sendTo(obj.from, obj.command, {
                        devices: devices,
                        newInstances: newInstances
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

function analyseDeviceDependencies(device, options, callback) {
    var count = 0;

    // try all found adapter types (with dependencies)
    for (var a in adapters) {
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

// addr can be IP address (192.168.1.1) or serial port name (/dev/ttyUSB0, COM1)
function analyseDevice(device, options, callback) {
    var count = 0;

    adapter.log.debug('Test ' + device._addr);

    // try all found adapter types (first without dependencies)
    for (var a in adapters) {
        if (!adapters.hasOwnProperty(a)) continue;
        if (typeof adapters[a].type === 'string' && adapters[a].type !== device._type) continue;
        if (typeof adapters[a].type === 'object' && adapters[a].type.indexOf(device._type) === -1) continue;
        if (adapters[a].dependencies) continue;

        count++;
        (function (adpr) {
            adapter.log.debug('Test ' + device._addr + ' ' + adpr);

            // expected, that detect method will add to _instances one instance of specific type or extend existing one
            adapters[a].detect(device._addr, device, options, function (err, isFound, addr) {
                if (isFound) {
                    adapter.log.debug('Test ' + device._addr + ' ' + adpr + ' DETECTED!');
                }
                if (!--count) analyseDeviceDependencies(device, options, callback);
            })
        })(a);
    }

    if (!count) analyseDeviceDependencies(device, options, callback);
}

function analyseDevices(devices, options, index, callback) {
    if (typeof index === 'function') {
        index = callback;
        index = 0;
    }
    adapter.setState('servicesProgress', Math.round((index / devices.length) * 100), true);

    if (!devices || index >= devices.length) {
        adapter.setState('servicesProgress', 100, true);
        callback(null);
        return;
    }

    analyseDevice(devices[index], options, function (err) {
        if (err) adapter.log.error('Error by analyse device: ' + err);
        setTimeout(analyseDevices, 0, devices, options, index + 1, callback);
    });
}

function getInstances(callback) {
    adapter.objects.getObjectView('system', 'instance', {startkey: 'system.adapter.', endkey: 'system.adapter.\u9999'}, function (err, doc) {
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

function getEnums() {

}

function discoveryEnd(devices, callback) {
    adapter.log.info('Found ' + devices.length + ' addresses');

    devices.push({
        _addr: '127.0.0.1',
        _name: 'localhost',
        _type: 'ip'
    });

    // analyse every IP address
    if (!adapters) enumAdapters();

    getInstances(function (instances) {
        adapter.getEnums(null, function (err, enums) {
            var options = {
                existingInstances: instances,
                newInstances: [],
                enums: enums,
                log: {
                    debug: function (text) {
                        adapter.log.debug(text);
                    },
                    warn: function (text) {
                        adapter.log.warn(text);
                    },
                    error: function (text) {
                        adapter.log.error(text);
                    },
                    info: function (text) {
                        adapter.log.info(text);
                    }
                }
            };
            analyseDevices(devices, options, 0, function (err) {
                adapter.log.info('Discovery finished. Found new or modified ' + options.newInstances.length + ' instances');

                // add this information to system.discovery.host
                adapter.getForeignObject('system.discovery', function (err, obj) {
                    if (!obj) {
                        obj = {
                            common: {
                                name: 'prepared update of discovery'
                            },
                            native: {},
                            type: 'config'
                        };
                    }

                    obj.native.newInstances = options.newInstances;
                    obj.native.devices = devices;
                    obj.native.lastScan = new Date().getTime();

                    adapter.setForeignObject('system.discovery', obj, function (err) {
                        isRunning = false;
                        if (err) adapter.log.error('Cannot update system.discovery: ' + err);
                        adapter.log.info('Discovery finished');
                        if (typeof callback === 'function') callback(null, options.newInstances, devices);
                    });
                });
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

    //browse();
}
