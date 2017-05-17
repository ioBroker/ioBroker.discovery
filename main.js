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
var dns      = require('dns');
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
        haltAllMethods();
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
                adapter.log.debug('Received "browse" event');
                browse(obj.message, function (error, newInstances, devices) {
                    adapter.log.debug('Browse finished');
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
        case 'listMethods': {
            if (obj.callback) {
                adapter.log.debug('Received "listMethods" event');
                if (!methods || !methods.length) {
                    enumMethods();
                }
                
                adapter.sendTo(obj.from, obj.command, methods, obj.callback);
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
    adapter.setState('servicesProgress', Math.round(index * 100 / devices.length), true);
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
        if (err || !doc || !doc.rows || !doc.rows.length) return callback && callback ([]);
        var res = [];
        doc.rows.forEach(function (row) {
            res.push(row.value);
        });
        callback && callback (res);
    });
}

function discoveryEnd(devices, callback) {
    adapter.log.info('Found ' + devices.length + ' addresses');

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

var g_devices = {};
var g_devices_count = 0;
var g_browse = null;
var specialEntryNames = 'name,data,LOCATION'.split(',');

function haltAllMethods() {
    Object.keys(methods).forEach(function (method) {
        // not final
        if (method && method.halt !== undefined) {
             method.halt = true;
         }
    });
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// wraper class for each method module

var Method = function (methodName, parent) {
    if (!(this instanceof Method)) {
        return new Method(methodName, parent);
    }
    var module = methods[methodName];
    module.source = module.source || methodName;
    Object.assign(this, module);
    var self = this, doneCalled = 0;
    
    this.parent = parent;
    this.options = adapter.config;
    this.foundCount = 0;
    this.progress = 0;
    this.adapter = adapter;
    this.log = adapter.log;
    this.halt = parent.halt;
    this.halt [methodName] = false; // not necessary, but to see hwo to use
    
    this.add = this.addDevice = function (newDevice, err) {
        if (newDevice === null) {
            return self.done();
        }
        self.foundCount += 1;
        return parent.addDevice (newDevice, self.source, self.type);
    };
    
    this.get = this.getDevice = function (ip) {
         return g_devices[ip];
    };
    
    this.updateProgress = function(progress) {
        if (typeof progress === 'number') self.progress = Math.round(progress);
        adapter.log.debug (self.source + ': ' + self.progress + '%, devices - ' + self.foundCount);
        parent.updateProgress ();
    };
    
    this.done = function (err) {
        if (err) {
            adapter.log.warn(err);
        }
        if (doneCalled++) return;  // only one call accepted
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        self.progress = 100;
        adapter.log.info ('Done discovering ' + self.source + ' devices. ' + self.foundCount + ' packages received');
        parent.done (self);
    };
    this.close = this.done; // * this.close should be overwriten. Is called to stop searching
    
    var timer, interval;
    this.setTimeout = this.setInterval = function (timeout, options) {
        options = options || {};
        
        if (options.timeout !== false) {
            timer = setTimeout(function () {
                timer = null;
                self.close();

                if (!doneCalled) {
                    self.done();
                }
            }, timeout);
        }
        
        if (options.progress !== false) {
            parent.updateProgress();
            interval = setInterval(function() {
                self.progress += 5;

                parent.updateProgress();

                if (self.progrress > 95) {
                    clearInterval(interval);
                    interval = null;
                }
            }, timeout / 20);
        }
    };
};

function browse(options, callback) {
    if (isRunning) {
        return callback && callback('Yet running');
    }
    
    isRunning = true;
    g_devices = {};
    g_devices_count = 0;
    
    adapter.setState('scanRunning', true, true);
    enumMethods();
    
    function Browse () {
        var self = this;
        adapter.config.stopPingOnTR064Ready = true; //
        
        var methodsArray = Object.keys(methods).filter(function (m) {
            return methods[m].browse && (!options || options.indexOf(m) !== -1);
        });
        this.count = methodsArray.length;
        this.foundCount = 0;
        this.halt = {};
        
        var timeoutProgress;
        this.updateProgress = function () {
            if (timeoutProgress) return;
            timeoutProgress = setTimeout(function () {
                timeoutProgress = null;
                var value = 0;
                methodsArray.forEach(function(n) {
                    value += methods[n].progress;
                });
                adapter.setState('devicesProgress', Math.round(value / methodsArray.length), true);
                adapter.setState('devicesFound', self.foundCount, true);
            }, 1000)
        };
        
        this.done = function (method) {
            if (method !== undefined) {
                self.count--;
            }
            self.updateProgress();
            if (!self.count) {
                self.count = -1;
                if (timeoutProgress) clearTimeout(timeoutProgress);
                var devices = [];
                Object.keys(g_devices).sort().forEach(function (n) {
                    devices.push(g_devices[n]);
                });
                self.getMissedNames(devices, function() {
                    devices.push({
                        _addr: '127.0.0.1',
                        _name: 'localhost',
                        _type: 'ip'
                    });
                    discoveryEnd (devices, callback);
                });
            }
        };
    
        this.getMissedNames = function (devices, callback) {
            var cnt = 0;
            (function doIt() {
                if (cnt >= devices.length) return callback();
                var dev = devices[cnt++];

                if (dev._name) {
                    return doIt();
                }

                dns.reverse (dev._addr, function (err, hostnames) {
                    dev._name = !err && hostnames && hostnames.length ? hostnames[0] : dev._sddr;
                    dev._dns = {
                        hostnames: hostnames
                    };
                    doIt();
                });
            })();
        };
        
        this.addDevice = function (newDevice, source/*methodName*/, type) {
            var device;
            if (!newDevice || !newDevice._addr) {
                return;
            }

            adapter.log.debug('main.addDevice: ip=' + newDevice._addr + ' source=' + source);
        
            if (!(device = g_devices[newDevice._addr])) {
                g_devices_count += 1;
                newDevice._source = source;
                newDevice._type = type || 'ip';
                newDevice._new = true;
                self.foundCount += 1;
                return g_devices[newDevice._addr] = newDevice;
            }
            delete newDevice._new;
            //debug:
            // device.__debug = device.__debug || [];
            // device.__debug.push(newDevice);
        
            (function _merge(dest, from) {
                Object.getOwnPropertyNames (from).forEach (function (name) {
                    if (name === '__debug') return;
                    if (typeof from[name] === 'object') {
                        if (typeof dest[name] !== 'object') {
                            dest[name] = {}
                        }
                        _merge (dest[name], from[name]);
                    } else {
                        var uneq = true;
                        var namex = name + 'x';
                        if (specialEntryNames.indexOf (name) >= 0 && dest[name] && from[name] !== undefined && (uneq = dest[name] !== from[name])) {
                            if (dest[namex] === undefined) dest[namex] = [dest[name]];
                            if (from[name] && dest[namex].indexOf(from[name]) < 0) dest[namex].push(from[name]);
                        }
                        if (uneq) dest[name] = from[name];
                    }
                });
            }) (device, newDevice);
        
            if (!device._name && newDevice._name) {
                device._name = newDevice._name;
            }
            return newDevice;
        };
    
        methodsArray.forEach (function(m) {
            //if (m !== 'ping') return;
            var method = Method(m, self);
            methods[m] = method;
            method.browse(method);
        });

        if (methodsArray.length === 0) {
            self.done();
        }
    }
    g_browse = new Browse();
}

function main() {
    adapter.setState('scanRunning', false, true);
    adapter.config.pingTimeout = parseInt(adapter.config.pingTimeout, 10) || 1000;
    adapter.config.pingBlock  = parseInt(adapter.config.pingBlock, 10) || 20;

    //browse();
}


