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
var adapters = {};
var methods  = null;

function enumAdapters() {
    var dir = fs.readdirSync(__dirname + '/lib/adapters');
    
    for (var f = 0; f < dir.length; f++) {
        var parts = dir[f].split('.');
        if (parts[parts.length - 1] === 'js') {
            parts.pop();
            
            var moduleName = __dirname + '/lib/adapters/' + dir[f];
            var aName =  parts.join('.');
            
            if (adapters && adapters[aName] && adapters[aName].reloadModule) {
                var module = require.resolve(moduleName);
                delete require.cache[module];
                delete adapters[aName];
            }
            if (!adapters[aName]) adapters[aName] = require(moduleName);
        }
    }
}

function enumMethods() {
    var dir = fs.readdirSync(__dirname + '/lib/methods');
    methods = {};
    for (var f = 0; f < dir.length; f++) {
        var parts = dir[f].split('.');
        if (parts[parts.length - 1] === 'js' && parts[0] !== '_') {
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
        adapter && adapter.setState && adapter.setState('scanRunning', false, true);
        isRunning = false;
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
                browse(obj.message, function (error, newInstances, devices) {
                    adapter.log.info('Browse finished');
                    adapter.setState('scanRunning', false, true);
                    adapter.sendTo(obj.from, obj.command, {
                        error:        error,
                        devices:      devices,
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

function isValidAdapter(adapterName, type, dependencies) {
    if (!adapters.hasOwnProperty(adapterName)) return false;
    var adapter = adapters[adapterName];
    if (typeof adapter.type === 'string' && adapter.type !== type) return false;
    if (typeof adapter.type === 'object' && adapter.type.indexOf(type) === -1) return false;
    return ((!!adapter.dependencies) === dependencies);
}

function forEachValidAdapter(device, dependencies, callback) {
    if (typeof dependencies === 'function') {
        callback = dependencies;
        dependencies = undefined;
    }
    var cnt = 0, type;
    type = typeof device === 'object' ? device._type : device;
    for (var a in adapters) {
        if (isValidAdapter(a, type, dependencies)) {
            callback && callback(adapters[a], a);
            cnt += 1;
        }
    }
    return cnt;
}


function analyseDeviceDependencies(device, options, callback) {
    var count = forEachValidAdapter(device, true);
    var callbacks = {};

    // try all found adapter types (with dependencies)
    forEachValidAdapter(device, true, function(_adapter, a) {
        var timeout = setTimeout(function () {
            timeout = null;
            //options.log.error('Timeout by detect "' + adpr + '" on "' + device._addr + '": ' + (adapters[adpr].timeout || 2000) + 'ms');
            if (!--count) {
                analyseDeviceDependencies(device, options, callback);
                count = false;
            }
        }, adapters[a].timeout || 2000);


        (function (adpr) {
            adapter.log.debug('Test ' + device._addr + ' ' + adpr);

            // expected, that detect method will add to _instances one instance of specific type or extend existing one
            adapters[a].detect(device._addr, device, options, function (err, isFound, addr) {
                if (callbacks[adpr]) {
                    adapter.log.error('Double callback by "' + adpr + '"');
                } else {
                    callbacks[adpr] = true;
                }

                if (isFound) {
                    adapter.log.debug('Test ' + device._addr + ' ' + adpr + ' DETECTED!');
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (count !== false && !--count) {
                        count = false;
                        callback(err);
                    }
                }
            })
        })(a);
    });

    if (count === 0) callback(null);
}

function analyseDeviceSerial(device, options, list, callback) {
    if (!list || !list.length) {
        callback();
    } else {
        var adpr = list.shift();
        adapter.log.debug('Test ' + device._addr + ' ' + adpr);

        var done = false;
        var timeout = setTimeout(function () {
            timeout = null;
            //options.log.error('Timeout by detect "' + adpr + '" on "' + device._addr + '": ' + (adapters[adpr].timeout || 2000) + 'ms');
            analyseDeviceSerial(device, options, list, callback);
        }, adapters[adpr].timeout || 2000);

        try {
            // expected, that detect method will add to _instances one instance of specific type or extend existing one
            adapters[adpr].detect(device._addr, device, options, function (err, isFound, addr) {
                if (timeout) {
                    if (done) {
                        adapter.log.error('Double callback by "' + adpr + '"');
                    } else {
                        done = true;
                    }

                    clearTimeout(timeout);
                    timeout = null;
                    setTimeout(analyseDeviceSerial, 0, device, options, list, callback);
                }
                if (isFound) {
                    adapter.log.debug('Test ' + device._addr + ' ' + adpr + ' DETECTED!');
                }
            });
        } catch (e) {
            options.log.error('Cannot detect "' + adpr + '" on "' + device._addr + '": ' + e);
            setTimeout(analyseDeviceSerial, 0, device, options, list, callback);
        }
    }
}


// addr can be IP address (192.168.1.1) or serial port name (/dev/ttyUSB0, COM1)
function analyseDevice(device, options, callback) {
    var count = forEachValidAdapter(device, false);

    if (device._type === 'serial') {
        var list = [];
        forEachValidAdapter(device, false, function(adapter, aName) {
            list.push(aName);
        });
        analyseDeviceSerial(device, options, list, function () {
            analyseDeviceDependencies(device, options, callback);
        });
    } else {
        var callbacks = {};
        // try all found adapter types (first without dependencies)
        forEachValidAdapter(device, false, function(_adapter, a) {

            (function (adpr) {
                adapter.log.debug('Test ' + device._addr + ' ' + adpr);

                var timeout = setTimeout(function () {
                    timeout = null;
                    //options.log.error('Timeout by detect "' + adpr + '" on "' + device._addr + '": ' + (adapters[adpr].timeout || 2000) + 'ms');
                    if (count !== false && !--count) {
                        analyseDeviceDependencies(device, options, callback);
                        count = false;
                    }
                }, adapters[adpr].timeout || 2000);

                try {
                    // expected, that detect method will add to _instances one instance of specific type or extend existing one
                    adapters[adpr].detect(device._addr, device, options, function (err, isFound, addr) {
                        if (timeout) {
                            if (callbacks[adpr]) {
                                adapter.log.error('Double callback by "' + adpr + '"');
                            } else {
                                callbacks[adpr] = true;
                            }

                            clearTimeout(timeout);
                            timeout = null;
                            if (count !== false && !--count) {
                                analyseDeviceDependencies(device, options, callback);
                                count = false;
                            }
                        }
                        if (isFound) {
                            adapter.log.debug('Test ' + device._addr + ' ' + adpr + ' DETECTED!');
                        }
                    });
                } catch (e) {
                    adapter.log.error('Cannot detect "' + adpr + '" on "' + device._addr + '": ' + e);
                    if (count !== false && !--count) {
                        analyseDeviceDependencies(device, options, callback);
                        count = false;
                    }
                }
            })(a);
        });
        if (count === 0) analyseDeviceDependencies(device, options, callback);
    }
}

function analyseDevices(devices, options, index, callback) {
    if (typeof index === 'function') {
        index = callback;
        index = 0;
    }
    adapter.setState('servicesProgress', Math.round((index / devices.length) * 100), true);
    adapter.setState('instancesFound', options.newInstances.length, true);

    if (!devices || index >= devices.length) {
        var count = 0;
        for (var aa in adapters) {
            if (!adapters.hasOwnProperty(aa)) continue;
            if (adapters[aa].type !== 'advice') continue;

            count++;
        }

        var callbacks = {};
        // add suggested adapters
        for (var a in adapters) {
            if (!adapters.hasOwnProperty(a)) continue;
            if (adapters[a].type !== 'advice') continue;

            (function (adpr) {
                try {
                    // expected, that detect method will add to _instances one instance of specific type or extend existing one
                    adapters[adpr].detect(null, null, options, function (err, isFound, name) {
                        if (callbacks[adpr]) {
                            adapter.log.error('Double callback by "' + adpr + '"');
                        } else {
                            callbacks[adpr] = true;
                        }
                        if (isFound) {
                            adapter.log.debug('Added suggested adapter: ' + name);
                        }
                        if (!--count && callback) {
                            adapter.setState('servicesProgress', 100, true);
                            adapter.setState('instancesFound', options.newInstances.length, true);
                            callback && callback(null);
                            callback =  null;
                        }
                    });
                } catch (e) {
                    adapter.log.error('Cannot detect suggested adapter: ' + e);
                    count--;
                }
            })(a);
        }
        if (!count && callback) {
            adapter.setState('servicesProgress', 100, true);
            adapter.setState('instancesFound', options.newInstances.length, true);
            callback && callback(null);
            callback =  null;
        }
    } else {
        analyseDevice(devices[index], options, function (err) {
            if (err) adapter.log.error('Error by analyse device: ' + err);
            setTimeout(analyseDevices, 0, devices, options, index + 1, callback);
        });
    }
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

function discoveryEnd(devices, callback) {
    adapter.log.info('Found ' + devices.length + ' addresses');

    // devices.push({
    //     _addr: '127.0.0.1',
    //     _name: 'localhost',
    //     _type: 'ip'
    // });

    // will be done in checking double ips
    // try to find names for all IPs
    // for (var d = 0; d < devices.length; d++) {
    //     if (!devices[d]._name) {
    //         for (var dd = 0; dd < devices.length; dd++) {
    //             if (devices[dd]._name && devices[d]._addr === devices[dd]._addr) {
    //                 devices[d]._name = devices[dd]._name;
    //                 break;
    //             }
    //         }
    //     }
    // }

    // Get the list of adapters with auto-discovery
    enumAdapters();

    getInstances(function (instances) {
        adapter.getEnums(null, function (err, enums) {
            // read language
            adapter.getForeignObject('system.config', function (err, obj) {
                var options = {
                    existingInstances: instances,
                    newInstances: [],
                    enums: enums,
                    language: obj ? obj.common.language : 'en',
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
                
                
                // // remove double devices
                // devices.sort(function (a, b) {
                //     if (a._addr > b._addr) return -1;
                //     if (a._addr < b._addr) return 1;
                //     return 0;
                // });
                //
                // // remove double entries from upnp and ip
                // // and merge available object infos. e.g _upnp or _mdns
                // // the adapter can test device._upnp !== 'undefined' instead of device._source === 'upnp'
                // for (var d = devices.length - 2; d >= 0; d--) {
                //     var dd = devices[d], dd1 = devices[d + 1];
                //     if (dd._addr === dd1._addr) {
                //         if (dd._source !== 'ping') {
                //             // if (dd._upnp) device[d+1]._upnp = dd._upnp;
                //             // if (dd._mdns) device[d+1]._mdns = dd._mdns;
                //             Object.keys(dd).forEach(function(n) {
                //                  if (typeof dd[n] === 'object' && !dd1[n]) dd1[n] = dd[n];
                //             });
                //             if (!dd1._name) dd1._name = dd._name;
                //             devices.splice(d, 1);
                //         } else {
                //             if (!dd1._name) dd._name = dd._name;
                //             devices.splice(d + 1, 1);
                //         }
                //     }
                // }
                
                // devices.forEach(function(d,i) {
                //     var s = '_upnp=' + !!d._upnp + ' _mdns=' + !!d._mdns + ' _wifi_mi_light=' + !!d._wifi_mi_light;
                //     console.log('discovery.discoveryEnd..ip=' + d._addr + ' name=' + d._name + ' ' + s);
                // });
                
                options._devices = devices; // allow adapters to know all ips and their infos
                options._g_devices = g_devices;
                
                // analyse every IP address
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
                        var oldInstances = obj.native.newInstances || [];
                        obj.native.newInstances = options.newInstances;
                        obj.native.devices = devices;
                        obj.native.lastScan = new Date().getTime();
                        for (var j = oldInstances.length - 1; j >= 0; j--) {
                            if (oldInstances[j].comment.ack) {
                                delete oldInstances[j].comment.ack;
                                oldInstances[j]._id = oldInstances[j]._id.replace(/\.\d+$/, '');
                                oldInstances[j]= JSON.stringify(oldInstances[j]);
                            } else {
                                oldInstances.splice(j, 1);
                            }
                        }
                        for (var i = 0; i < oldInstances.length; i++) {
                            for (var n = 0; n < options.newInstances.length; n++) {
                                var modified = JSON.parse(JSON.stringify(options.newInstances[n]));
                                modified._id = modified._id.replace(/\.\d+$/, '');
                                if (oldInstances[i] === JSON.stringify(modified)) {
                                    options.newInstances[n].comment.ack = true;
                                    break;
                                }
                            }
                        }

                        adapter.setForeignObject('system.discovery', obj, function (err) {
                            isRunning = false;
                            if (err) adapter.log.error('Cannot update system.discovery: ' + err);
                            adapter.log.info('Discovery finished');
                            adapter.setState('scanRunning', false, true);
                            if (typeof callback === 'function') callback(null, options.newInstances, devices);
                        });
                    });
                });
            });
        });
    });
}

// var timeoutProgress;
// function updateFindProgress(progress, devices) {
//     if (timeoutProgress) return;
//     timeoutProgress = setTimeout(function () {
//         timeoutProgress = null;
//         var count = 0;
//         var value = 0;
//         var devs  = 0;
//         for (var p in progress) {
//             if (progress.hasOwnProperty(p)) {
//                 count++;
//                 value += progress[p];
//             }
//         }
//         // if (devices) {
//         //     for (var d in devices) {
//         //         if (devices.hasOwnProperty(d)) {
//         //             devs += devices[d];
//         //         }
//         //     }
//         // }
//         devs = g_devices.length;
//
//         //adapter.setState('devicesProgress', Math.round(value / count * 100) / 100, true);
//         adapter.setState('devicesProgress', Math.round((value * 100) / count) / 100, true);
//         adapter.setState('devicesFound', devs, true);
//     }, 1000)
// }

var g_devices = {};
var g_devices_count = 0;

function addDevice (newDevice, source/*methodName*/, type) {
    var device;
    if (!newDevice || !newDevice._addr) return;
    adapter.log.debug('main.addDevice: ip=' + newDevice._addr + ' source=' + source);
    newDevice._source = source;
    newDevice._type = type || 'ip';
    
    if (!(device = g_devices[newDevice._addr])) {
        g_devices_count += 1;
        return g_devices[newDevice._addr] = newDevice;
    }
    
    Object.keys(newDevice).forEach(function (n) {
         if (typeof newDevice[n] === 'object' && !device[n]) device[n] = newDevice[n];
    });
    //if (device ['_' + source] = newDevice;
    if (!device._name && newDevice._name) device._name = newDevice._name;
    return newDevice;
}

exports.adapter = adapter;


function getMissedNames(devices, callback) {
     return callback();
    // todo
    // dns.reverse(rinfo.address, function (err, hostnames) {
    //     obj._name = hostnames && hostnames.length ? hostnames[0] : rinfo.address;
    // });
}

function browse(options, callback) {
    if (isRunning) {
        if (callback) callback('Yet running');
        return;
    }
    isRunning = true;
    g_devices = {}; //.length = 0;
    g_devices_count = 0;
    
    adapter.setState('scanRunning', true, true);
    enumMethods();
    
    var timeoutProgress;
    function updateProgress() {
        if (timeoutProgress) return;
        timeoutProgress = setTimeout(function () {
            timeoutProgress = null;
            var value = 0;
            methodsArray.forEach(function(n) {
                value += methods[n].progress;
            });
            adapter.setState('devicesProgress', Math.round((value * 100) / methodsArray.length) / 100, true);
            adapter.setState('devicesFound', g_devices_count, true);
        }, 1000)
    }
    
    function doReturn (count, method) {
        if (method !== undefined) {
            method.progress = 100;
            count--;
        }
        updateProgress();
        if (!count) {
            count = -1;
            if (timeoutProgress) clearTimeout(timeoutProgress);
            var devices = [];
            Object.keys(g_devices).sort().forEach(function (n) {
                devices.push(g_devices[n]);
            });
            getMissedNames(devices, function() {
                devices.push({
                    _addr: '127.0.0.1',
                    _name: 'localhost',
                    _type: 'ip'
                });
                discoveryEnd (devices, callback);
            });
        }
    }
    
    var callOptions = Object.assign ( { halt: {}, adapter: adapter }, adapter.config);
    var methodsArray = Object.keys(methods).filter(function(m) {
        return methods[m].browse && (!options || options.indexOf (m) !== -1);
    });
    var count = methodsArray.length;
    methodsArray.forEach(function(m) {
        // methods[m].used = false;
        // //if (!methods.hasOwnProperty(m) || !methods[m].browse) return;
        // if (!methods[m].browse) return;
        // if (options && options.indexOf(m) === -1) return;
        
        
        // method.foundCount = 0;
        // method.progress = 0;
        // method.source = method.source || m;
        // method.used = true;
        //
        //xxx
        //progress[m] = 0;
        // methods[m].browse(Object.assign({ halt: halt, adapter: adapter }, adapter.config ), adapter.log,
        //     function (name, _progress, _devices) {
        //         adapter.log.debug(this.source + ': ' + _progress + '%, devices - ' + this.export.foundCount);
        //         this.progress = _progress;
        //         updateProgress();
        //     }.bind(method),
        //     function (err, _result, source, type) {
        //     },
        //     function (newDevice, methodName, type, done) {
        //         if (newDevice === null) {
        //             adapter.log.info('Done discovering ' + this.source + ' devices. ' + this.foundCount + 'devices found');
        //             return doNext(-1);
        //         }
        //         this.foundCount += 1;
        //         if (this.source === 'upnp')  {
        //             var i = 1;
        //         }
        //         return addDevice (newDevice, this.source, this.type, done);
        //     }.bind(method)
        // )
        
        (function callMethod (_m) {
            //count++;
            var method = methods[_m];
            method.source = method.source || _m;
            method.foundCount = 0;
            method.progress = 0;
            //method.used = true;
    
            //adapter.log.info ('calling ' + method.source + '.browse...');
            method.browse (callOptions, adapter.log,
                
                //function (name, _progress, _devices) {
                function (_progress, _count) {
                    if (typeof _progress === 'number') method.progress = _progress;
                    if (typeof _count === 'number') method._foundCount = _count;
                    adapter.log.debug (method.source + ': ' + method.progress + '%, devices - ' + method.foundCount);
                    updateProgress ();
                }, //.bind (method),
                
                // function (err, _result, source, type) {
                // },
                
                function (newDevice, err) {
                    if (newDevice === null) {
                        adapter.log.info ('Done discovering ' + method.source + ' devices. ' + method.foundCount + ' devices found');
                        return doReturn (--count, method);
                    }
                    method.foundCount += 1;
                    return addDevice (newDevice, method.source, method.type);
                } //.bind (method)
            )
        })(m);
    });
    if (methodsArray.length === 0) doReturn();
}



function xbrowse(options, callback) {
    if (isRunning) {
        if (callback) callback('Yet running');
        return;
    }
    adapter.setState('scanRunning', true, true);
    isRunning = true;
    enumMethods();

    var count    = 0;
    var result   = [];
    var progress = [];
    var devices  = [];
    var ar = Object.keys(methods);
    for (var m in methods) {
        if (!methods.hasOwnProperty(m) || !methods[m].browse) continue;
        if (options && options.indexOf(m) === -1) continue;

        count++;
        progress[m] = 0;
        methods[m].browse(adapter.config, adapter.log,
            function (name, _progress, _devices) {
                adapter.log.debug(name + ': ' + _progress + '%, devices - ' + _devices);
                progress[name] = _progress;
                devices[name]  = _devices;
                updateFindProgress(progress, devices);
            },
            function (err, _result, source, type) {
                if (_result) {
                    for (var r = 0; r < _result.length; r++) {
                        _result[r]._source = source;
                        _result[r]._type = type;
                    }
                    result = result.concat(_result);
                }
                if (!--count) discoveryEnd(result, callback);
            });
    }
    if (!count) discoveryEnd(result, callback);
}



function main() {
    adapter.setState('scanRunning', false, true);
    adapter.config.pingTimeout = parseInt(adapter.config.pingTimeout, 10) || 1000;
    adapter.config.pingBlock  = parseInt(adapter.config.pingBlock, 10) || 20;

    //browse();
}


