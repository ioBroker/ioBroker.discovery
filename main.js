/**
 *
 *      ioBroker Discovery Adapter
 *
 *      Copyright (c) 2017-2026 Denis Haev ak Bluefox <dogafox@gmail.com>
 *
 *      MIT License
 *
 */

/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */

'use strict';
const fs = require('node:fs');
const dns = require('node:dns');

const { Adapter, commonTools } = require('@iobroker/adapter-core'); // Get common adapter utils
const getAdapterDir = commonTools.getAdapterDir;
let methods = null;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// wrapper class for each method module

class Method {
    constructor(adapter, gDevices, methodName, parent) {
        const module = methods[methodName];
        module.source = module.source || methodName;
        Object.assign(this, module);
        let doneCalled = 0;

        this.parent = parent;
        this.options = adapter.config;
        this.foundCount = 0;
        this.progress = 0;
        this.adapter = adapter;
        this.log = adapter.log;
        this.halt = parent.halt;
        this.halt[methodName] = false; // not necessary, but to see hwo to use

        this.add = newDevice => {
            if (newDevice === null) {
                return this.done();
            }
            this.foundCount += 1;
            return parent.addDevice(newDevice, this.source, this.type);
        };

        this.addDevice = this.add;

        this.get = (ip, type) => {
            type ||= 'ip';
            if (gDevices[type] === undefined) {
                return undefined;
            }
            return gDevices[type][ip];
        };

        this.updateProgress = progress => {
            if (typeof progress === 'number') {
                this.progress = Math.round(progress);
            }
            adapter.log.debug(`${this.source}: ${this.progress}%, devices - ${this.foundCount}`);
            parent.updateProgress();
        };

        let timer;
        let interval;

        this.done = err => {
            if (err) {
                adapter.log.warn(err);
            }
            if (doneCalled++) {
                return;
            } // only one call accepted
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
            this.progress = 100;
            adapter.log.info(`Done discovering ${this.source} devices. ${this.foundCount} packages received`);
            parent.done(this);
        };
        this.close = this.done; // * this.close should be overwritten. Is called to stop searching

        this.setTimeout = this.setInterval = (timeout, options) => {
            options ||= {};

            if (options.timeout !== false) {
                timer = setTimeout(() => {
                    timer = null;
                    this.close();

                    if (!doneCalled) {
                        this.done();
                    }
                }, timeout);
            }

            if (options.progress !== false) {
                parent.updateProgress();
                interval = setInterval(() => {
                    this.progress += 5;

                    parent.updateProgress();

                    if (this.progress > 95) {
                        clearInterval(interval);
                        interval = null;
                    }
                }, timeout / 20);
            }
        };
    }
}

class Browse {
    specialEntryNames = 'name,data,LOCATION'.split(',');
    timeoutProgress = null;

    constructor(adapter, options, onFinished) {
        this.adapter = adapter;
        this.onFinished = onFinished;
        this.adapter.config.stopPingOnTR064Ready = true; //

        this.methodsArray = Object.keys(methods).filter(m => methods[m].browse && (!options || options.includes(m)));

        this.count = this.methodsArray.length;
        this.foundCount = 0;
        this.halt = {};
        this.methodsArray.forEach(m => {
            const method = new Method(this.adapter, this.adapter.gDevices, m, this);
            methods[m] = method;
            method.browse(method);
        });

        if (!this.methodsArray.length) {
            this.done();
        }
    }

    updateProgress = () => {
        if (this.timeoutProgress) {
            return;
        }
        this.timeoutProgress = setTimeout(() => {
            this.timeoutProgress = null;
            let value = 0;
            this.methodsArray.forEach(n => (value += methods[n].progress));
            this.adapter.setState('devicesProgress', Math.round(value / this.methodsArray.length), true);
            this.adapter.setState('devicesFound', this.foundCount, true);
        }, 1000);
    };

    done = method => {
        if (method !== undefined) {
            this.count--;
        }
        this.updateProgress();
        if (!this.count) {
            this.count = -1;
            if (this.timeoutProgress) {
                clearTimeout(this.timeoutProgress);
                this.timeoutProgress = null;
            }

            const devices = [];

            Object.keys(this.adapter.gDevices)
                .sort()
                .forEach(t =>
                    Object.keys(this.adapter.gDevices[t])
                        .sort()
                        .forEach(d => devices.push(this.adapter.gDevices[t][d])),
                );

            this.getMissedNames(devices, () => {
                devices.push({
                    _addr: '0.0.0.0',
                    _name: 'localhost',
                    _type: 'once',
                });
                this.onFinished(devices);
            });
        }
    };

    getMissedNames = (devices, callback) => {
        let cnt = 0;
        const doIt = () => {
            if (cnt >= devices.length) {
                return callback();
            }
            const dev = devices[cnt++];

            if (dev._name) {
                return doIt();
            }

            dns.reverse(dev._addr, (err, hostnames) => {
                dev._name = !err && hostnames?.length ? hostnames[0] : dev._sddr;
                dev._dns = {
                    hostnames,
                };
                doIt();
            });
        };
        doIt();
    };

    addDevice = (newDevice, source /* methodName */, type) => {
        let device;
        if (!newDevice?._addr) {
            return;
        }

        this.adapter.gDevices[type] ||= {};

        const old = this.adapter.gDevices[type][newDevice._addr];

        if (old?._type === type) {
            device = old;
            this.adapter.log.debug(`extended Device: ${newDevice._addr} source=${source}`);
            if (type === 'upnp' && !old._upnp) {
                old._upnp = [];
            }

            if (newDevice._upnp !== undefined) {
                old._upnp.push(newDevice._upnp);
            }

            this.adapter.gDevices[type][newDevice._addr] = old;
        } else {
            this.adapter.log.debug(`main.addDevice: ip=${newDevice._addr} source=${source}`);

            if (type === 'upnp') {
                newDevice._upnp = [newDevice._upnp];
            }

            newDevice._source = source;
            newDevice._type = type || 'ip';
            newDevice._new = true;
            this.foundCount += 1;
            this.adapter.gDevices[type][newDevice._addr] = newDevice;
            device = {};
        }
        delete newDevice._new;
        //debug:
        // device.__debug = device.__debug || [];
        // device.__debug.push(newDevice);
        const _merge = (dest, from) => {
            Object.getOwnPropertyNames(from).forEach(name => {
                if (name === '__debug') {
                    return;
                }
                if (typeof from[name] === 'object') {
                    if (typeof dest[name] !== 'object') {
                        dest[name] = {};
                    }
                    _merge(dest[name], from[name]);
                } else {
                    let uneq = true;
                    const namex = `${name}x`;
                    if (
                        this.specialEntryNames.includes(name) &&
                        dest[name] &&
                        from[name] !== undefined &&
                        (uneq = dest[name] !== from[name])
                    ) {
                        if (dest[namex] === undefined) {
                            dest[namex] = [dest[name]];
                        }
                        if (from[name] && !dest[namex].includes(from[name])) {
                            dest[namex].push(from[name]);
                        }
                    }
                    if (uneq) {
                        dest[name] = from[name];
                    }
                }
            });
        };

        _merge(device, newDevice);

        if (!device._name && newDevice._name) {
            device._name = newDevice._name;
        }
        return true;
    };
}

class DiscoveryAdapter extends Adapter {
    gDevices = {};
    isRunning = false;
    adapters = {};

    constructor(options) {
        super({
            ...options,
            name: 'discovery',
            message: obj => this.processMessage(obj),
            ready: () => this.main(),
            unload: callback => {
                if (this.isRunning) {
                    this?.setState?.('scanRunning', false, true);
                    this.isRunning = false;
                    this.haltAllMethods();
                    setTimeout(() => callback?.(), 1000);
                } else if (callback) {
                    callback();
                }
            },
        });
    }

    enumAdapters(repository) {
        let dir;
        try {
            dir = fs.readdirSync(`${__dirname}/lib/adapters`);
        } catch (err) {
            this.log.warn(`Adapter scan classes not found: ${err}`);
            dir = [];
        }

        for (let f = 0; f < dir.length; f++) {
            const parts = dir[f].split('.');
            if (parts[parts.length - 1] === 'js') {
                parts.pop();

                const moduleName = `${__dirname}/lib/adapters/${dir[f]}`;
                const aName = parts.join('.');

                if (this.adapters?.[aName]?.reloadModule) {
                    const module = require.resolve(moduleName);
                    delete require.cache[module];
                    delete this.adapters[aName];
                }

                // check if this adapter available in repository
                if (!this.adapters[aName] && (!repository || repository.includes(aName))) {
                    this.adapters[aName] = require(moduleName);
                }
            }
        }
    }

    enumMethods() {
        const dir = fs.readdirSync(`${__dirname}/lib/methods`);
        methods = {};
        for (let f = 0; f < dir.length; f++) {
            const parts = dir[f].split('.');
            if (parts[parts.length - 1] === 'js' && parts[0] !== '_') {
                parts.pop();
                methods[parts.join('.')] = require(`${__dirname}/lib/methods/${dir[f]}`);
            }
        }
    }

    processMessage(obj) {
        if (!obj?.command) {
            return;
        }
        switch (obj.command) {
            case 'browse': {
                if (obj.callback) {
                    this.log.debug('Received "browse" event');
                    this.browse(obj.message, (error, newInstances, devices) => {
                        this.log.debug('Browse finished');
                        this.setState('scanRunning', false, true);
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                error,
                                devices,
                                newInstances,
                            },
                            obj.callback,
                        );
                    });
                }
                break;
            }
            case 'listMethods': {
                if (obj.callback) {
                    this.log.debug('Received "listMethods" event');
                    if (!methods || !methods.length) {
                        this.enumMethods();
                    }

                    this.sendTo(obj.from, obj.command, methods, obj.callback);
                }
                break;
            }
        }
    }

    isValidAdapter(adapterName, type, dependencies) {
        if (!Object.prototype.hasOwnProperty.call(this.adapters, adapterName)) {
            return false;
        }
        const adapter = this.adapters[adapterName];

        if (typeof adapter.type === 'string' && adapter.type !== type) {
            return false;
        }
        if (typeof adapter.type === 'object' && !adapter.type.includes(type)) {
            return false;
        }
        return !!adapter.dependencies === dependencies;
    }

    forEachValidAdapter(device, dependencies, callback) {
        if (typeof dependencies === 'function') {
            callback = dependencies;
            dependencies = undefined;
        }
        let cnt = 0;
        const type = typeof device === 'object' ? device._type : device;
        for (const a in this.adapters) {
            if (Object.prototype.hasOwnProperty.call(this.adapters, a) && this.isValidAdapter(a, type, dependencies)) {
                callback?.(this.adapters[a], a);
                cnt += 1;
            }
        }
        return cnt;
    }

    analyseDeviceDependencies(device, options, callback) {
        let count = this.forEachValidAdapter(device, true);
        const callbacks = {};

        // try all found adapter types (with dependencies)
        this.forEachValidAdapter(device, true, (_adapter, a) => {
            let timeout = setTimeout(() => {
                timeout = null;
                //options.log.error('Timeout by detect "' + adpr + '" on "' + device._addr + '": ' + (adapters[adpr].timeout || 2000) + 'ms');
                if (!--count) {
                    this.analyseDeviceDependencies(device, options, callback);
                    count = false;
                }
            }, this.adapters[a].timeout || 2000);

            (adpr => {
                this.log.debug(`Test ${device._type} ${device._addr} ${adpr}`);
                // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                this.adapters[adpr].detect(device._addr, device, options, (err, isFound /* , addr */) => {
                    if (callbacks[adpr]) {
                        this.log.error(`Double callback by "${adpr}"`);
                    } else {
                        callbacks[adpr] = true;
                    }

                    if (isFound) {
                        this.log.debug(`Test ${device._type} ${device._addr} ${adpr} DETECTED!`);
                    }
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                        if (count !== false && !--count) {
                            count = false;
                            callback(err);
                        }
                    }
                });
            })(a);
        });

        if (count === 0) {
            callback(null);
        }
    }

    analyseDeviceSerial(device, options, list, callback) {
        if (!list?.length) {
            callback();
        } else {
            const adpr = list.shift();
            this.log.debug(`Test ${device._addr} ${adpr}`);

            let done = false;
            let timeout = setTimeout(() => {
                timeout = null;
                //options.log.error('Timeout by detect "' + adpr + '" on "' + device._addr + '": ' + (adapters[adpr].timeout || 2000) + 'ms');
                this.analyseDeviceSerial(device, options, list, callback);
            }, this.adapters[adpr].timeout || 2000);

            try {
                // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                this.adapters[adpr].detect(device._addr, device, options, (err, isFound /* , addr */) => {
                    if (timeout) {
                        if (done) {
                            this.log.error(`Double callback by "${adpr}"`);
                        } else {
                            done = true;
                        }

                        clearTimeout(timeout);
                        timeout = null;
                        setTimeout(() => this.analyseDeviceSerial(device, options, list, callback), 0);
                    }
                    if (isFound) {
                        this.log.debug(`Test ${device._addr} ${adpr} DETECTED!`);
                    }
                });
            } catch (e) {
                options.log.error(`Cannot detect "${adpr}" on "${device._addr}": ${e}`);
                setTimeout(() => this.analyseDeviceSerial(device, options, list, callback), 0);
            }
        }
    }

    // addr can be IP address (192.168.1.1) or serial port name (/dev/ttyUSB0, COM1)
    analyseDevice(device, options, callback) {
        let count = this.forEachValidAdapter(device, false);

        if (device._type === 'serial') {
            const list = [];
            this.forEachValidAdapter(device, false, (adapter, aName) => list.push(aName));
            this.analyseDeviceSerial(device, options, list, () =>
                this.analyseDeviceDependencies(device, options, callback),
            );
        } else {
            const callbacks = {};
            // try all found adapter types (first without dependencies)
            this.forEachValidAdapter(device, false, (_adapter, a) => {
                (adpr => {
                    this.log.debug(`Test ${device._type} ${device._addr} ${adpr}`);

                    let timeout = setTimeout(() => {
                        timeout = null;
                        //options.log.error('Timeout by detect "' + adpr + '" on "' + device._addr + '": ' + (adapters[adpr].timeout || 2000) + 'ms');
                        if (count !== false && !--count) {
                            this.analyseDeviceDependencies(device, options, callback);
                            count = false;
                        }
                    }, this.adapters[adpr].timeout || 2000);

                    try {
                        // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                        this.adapters[adpr].detect(device._addr, device, options, (err, isFound /* , addr */) => {
                            if (timeout) {
                                if (callbacks[adpr]) {
                                    this.log.error(`Double callback by "${adpr}"`);
                                } else {
                                    callbacks[adpr] = true;
                                }

                                clearTimeout(timeout);
                                timeout = null;
                                if (count !== false && !--count) {
                                    this.analyseDeviceDependencies(device, options, callback);
                                    count = false;
                                }
                            }

                            if (isFound) {
                                this.log.debug(`Test ${device._addr} ${adpr} DETECTED!`);
                            }
                        });
                    } catch (e) {
                        this.log.error(`Cannot detect "${adpr}" on "${device._addr}": ${e}`);
                        if (count !== false && !--count) {
                            this.analyseDeviceDependencies(device, options, callback);
                            count = false;
                        }
                    }
                })(a);
            });
            if (count === 0) {
                this.analyseDeviceDependencies(device, options, callback);
            }
        }
    }

    analyseDevices(devices, options, index, callback) {
        if (typeof index === 'function') {
            index = callback;
            index = 0;
        }
        this.setState('servicesProgress', Math.round((index * 100) / devices.length), true);
        this.setState('instancesFound', options.newInstances.length, true);

        if (!devices || index >= devices.length) {
            let count = 0;
            for (const aa in this.adapters) {
                if (!Object.prototype.hasOwnProperty.call(this.adapters, aa)) {
                    continue;
                }
                if (this.adapters[aa].type !== 'advice') {
                    continue;
                }

                count++;
            }

            const callbacks = {};
            // add suggested adapters
            for (const a in this.adapters) {
                if (!Object.prototype.hasOwnProperty.call(this.adapters, a)) {
                    continue;
                }
                if (this.adapters[a].type !== 'advice') {
                    continue;
                }

                (adpr => {
                    try {
                        // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                        this.adapters[adpr].detect(null, null, options, (err, isFound, name) => {
                            if (callbacks[adpr]) {
                                this.log.error(`Double callback by "${adpr}"`);
                            } else {
                                callbacks[adpr] = true;
                            }
                            if (isFound) {
                                this.log.debug(`Added suggested adapter: ${name}`);
                            }
                            if (!--count && callback) {
                                this.setState('servicesProgress', 100, true);
                                this.setState('instancesFound', options.newInstances.length, true);
                                callback?.(null);
                                callback = null;
                            }
                        });
                    } catch (e) {
                        this.log.error(`Cannot detect suggested adapter: ${e}`);
                        count--;
                    }
                })(a);
            }
            if (!count && callback) {
                this.setState('servicesProgress', 100, true);
                this.setState('instancesFound', options.newInstances.length, true);
                callback?.(null);
                callback = null;
            }
        } else {
            this.analyseDevice(devices[index], options, err => {
                err && this.log.error(`Error by analyse device: ${err}`);
                setTimeout(() => this.analyseDevices(devices, options, index + 1, callback), 0);
            });
        }
    }

    getInstances(callback) {
        this.getObjectView(
            'system',
            'instance',
            { startkey: 'system.adapter.', endkey: 'system.adapter.\u9999' },
            (err, doc) => {
                if (err || !doc || !doc.rows || !doc.rows.length) {
                    return callback?.([]);
                }
                const res = [];
                doc.rows.forEach(row => res.push(row.value));
                callback?.(res);
            },
        );
    }

    discoveryEnd(devices, callback) {
        this.log.info(`Found ${devices.length} addresses`);

        this.getForeignObject('system.repositories', (err, repo) => {
            this.getForeignObject('system.config', (err, systemConfig) => {
                let repository = null;
                if (
                    repo?.native &&
                    systemConfig?.common?.activeRepo &&
                    repo.native.repositories?.[systemConfig.common.activeRepo]?.json
                ) {
                    repository = Object.keys(repo.native.repositories[systemConfig.common.activeRepo].json);
                }

                // use only installed adapter if onlyLocal flag activated
                if (this.config.onlyLocal) {
                    repository = repository?.filter(a => getAdapterDir(a));
                }

                // Get the list of adapters with auto-discovery
                this.enumAdapters(repository);

                this.getInstances(instances => {
                    this.getEnums(null, (err, enums) => {
                        // read language
                        this.getForeignObject('system.config', (err, obj) => {
                            const options = {
                                existingInstances: instances,
                                newInstances: [],
                                enums: enums,
                                language: obj ? obj.common.language : 'en',
                                log: {
                                    debug: text => this.log.debug(text),
                                    warn: text => this.log.warn(text),
                                    error: text => this.log.error(text),
                                    info: text => this.log.info(text),
                                },
                            };

                            options._devices = devices; // allow adapters to know all IPs and their infos
                            options._g_devices = this.gDevices;

                            // analyze every IP address
                            this.analyseDevices(devices, options, 0, async (/* err */) => {
                                this.log.info(
                                    `Discovery finished. Found new or modified ${options.newInstances.length} instances`,
                                );

                                // read secret
                                const systemConfig = await this.getForeignObjectAsync('system.config');
                                const secret =
                                    (systemConfig && systemConfig.native && systemConfig.native.secret) ||
                                    'Zgfr56gFe87jJOM';

                                // try to encrypt all passwords
                                options.newInstances.forEach(instance => {
                                    if (instance.encryptedNativeLegacy) {
                                        const list = instance.encryptedNativeLegacy;
                                        delete instance.encryptedNativeLegacy;
                                        list.forEach(attr => {
                                            if (instance.native[attr]) {
                                                instance.native[attr] = this.encrypt(secret, instance.native[attr]);
                                            }
                                        });
                                    }
                                });

                                // add this information to system.discovery.host
                                let obj;
                                try {
                                    obj = await this.getForeignObjectAsync('system.discovery');
                                } catch {
                                    // ignore
                                }

                                if (!obj) {
                                    obj = {
                                        common: {
                                            name: 'prepared update of discovery',
                                        },
                                        native: {},
                                        type: 'config',
                                    };
                                }
                                const oldInstances = obj.native.newInstances || [];
                                obj.native.newInstances = options.newInstances;
                                obj.native.devices = devices;
                                obj.native.lastScan = new Date().getTime();
                                for (let j = oldInstances.length - 1; j >= 0; j--) {
                                    if (oldInstances[j].comment.ack) {
                                        delete oldInstances[j].comment.ack;
                                        oldInstances[j]._id = oldInstances[j]._id.replace(/\.\d+$/, '');
                                        oldInstances[j] = JSON.stringify(oldInstances[j]);
                                    } else {
                                        oldInstances.splice(j, 1);
                                    }
                                }

                                for (let i = 0; i < oldInstances.length; i++) {
                                    for (let n = 0; n < options.newInstances.length; n++) {
                                        const modified = JSON.parse(JSON.stringify(options.newInstances[n]));
                                        modified._id = modified._id.replace(/\.\d+$/, '');
                                        if (oldInstances[i] === JSON.stringify(modified)) {
                                            options.newInstances[n].comment.ack = true;
                                            break;
                                        }
                                    }
                                }

                                await this.setForeignObjectAsync('system.discovery', obj);
                                this.isRunning = false;
                                if (err) {
                                    this.log.error(`Cannot update system.discovery: ${err}`);
                                }
                                this.log.info('Discovery finished');
                                this.setState('scanRunning', false, true);
                                if (typeof callback === 'function') {
                                    callback(null, options.newInstances, devices);
                                }
                            });
                        });
                    });
                });
            });
        });
    }

    haltAllMethods() {
        if (methods) {
            Object.keys(methods).forEach(method => {
                // not final
                if (method && method.halt !== undefined) {
                    method.halt = true;
                }
            });
        }
    }
    browse(options, callback) {
        if (this.isRunning) {
            return callback?.('Yet running');
        }

        this.isRunning = true;
        this.gDevices = {};

        this.setState('scanRunning', true, true);
        this.enumMethods();

        new Browse(this, options, devices => this.discoveryEnd(devices, callback));
    }

    main() {
        this.setState('scanRunning', false, true);
        this.config.pingTimeout = parseInt(this.config.pingTimeout, 10) || 1000;
        this.config.pingBlock = parseInt(this.config.pingBlock, 10) || 20;
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param [options]
     */
    module.exports = options => new DiscoveryAdapter(options);
} else {
    // otherwise start the instance directly
    new DiscoveryAdapter();
}
