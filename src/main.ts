/**
 *      ioBroker Discovery Adapter
 *
 *      Copyright (c) 2017-2026 Denis Haev ak Bluefox <dogafox@gmail.com>
 *
 *      MIT License
 */
import { readdirSync } from 'node:fs';
import { reverse } from 'node:dns';

import { Adapter, commonTools, type AdapterOptions } from '@iobroker/adapter-core';

import type {
    DetectOptions,
    DetectionModule,
    DiscoveredDevices,
    DiscoveryDevice,
    DiscoveryInstance,
    MethodInstance,
    MethodModule,
    MethodTimeoutOptions,
} from './lib/types';
import * as discoveryStates from './lib/discovery-states';
import * as migration from './lib/migration';
import * as notification from './lib/notification';

const getAdapterDir = commonTools.getAdapterDir;

/**
 * Every method module of this scan, keyed by file name.
 *
 * After `Browse` has started, the entries are replaced by their `Method` wrappers - the
 * `listMethods` message therefore answers with modules before the first scan and with
 * wrappers afterwards. Kept as is: the admin UI only reads `type` and `source`, which both
 * carry over.
 */
let methods: Record<string, MethodModule | MethodInstance> | null = null;

/** What `Method` needs from the `Browse` instance that owns it */
interface MethodParent {
    halt: Record<string, boolean>;
    addDevice: (device: DiscoveryDevice, source: string, type: string) => boolean | undefined;
    updateProgress: () => void;
    done: (method?: MethodInstance) => void;
}

// //////////////////////////////////////////////////////////////////////////////////////
// wrapper class for each method module

class Method {
    constructor(adapter: DiscoveryAdapter, gDevices: DiscoveredDevices, methodName: string, parent: MethodParent) {
        const module = methods![methodName] as MethodModule;
        module.source ||= methodName;
        Object.assign(this, module);
        let doneCalled = 0;

        const self = this as unknown as MethodInstance;

        self.parent = parent;
        // Note: this overwrites the module's own `exports.options`
        self.options = adapter.config;
        self.foundCount = 0;
        self.progress = 0;
        self.adapter = adapter;
        self.log = adapter.log;
        self.halt = parent.halt;
        self.halt[methodName] = false; // not necessary, but to see how to use

        self.add = (newDevice: DiscoveryDevice | null): unknown => {
            if (newDevice === null) {
                return self.done();
            }
            self.foundCount += 1;
            return parent.addDevice(newDevice, self.source, self.type);
        };

        self.addDevice = self.add;

        self.get = (ip: string, type?: string): DiscoveryDevice | undefined => {
            type ||= 'ip';
            if (gDevices[type] === undefined) {
                return undefined;
            }
            return gDevices[type][ip];
        };

        self.updateProgress = (progress?: number): void => {
            if (typeof progress === 'number') {
                self.progress = Math.round(progress);
            }
            adapter.log.debug(`${self.source}: ${self.progress}%, devices - ${self.foundCount}`);
            parent.updateProgress();
        };

        let timer: NodeJS.Timeout | null | undefined;
        let interval: NodeJS.Timeout | null | undefined;

        self.done = (err?: unknown): void => {
            if (err) {
                adapter.log.warn(err as any);
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
            self.progress = 100;
            adapter.log.info(`Done discovering ${self.source} devices. ${self.foundCount} packages received`);
            parent.done(self);
        };
        self.close = self.done; // * this.close should be overwritten. Is called to stop searching

        self.setTimeout = self.setInterval = (timeout: number, options?: MethodTimeoutOptions): void => {
            const opts = options || {};

            if (opts.timeout !== false) {
                timer = setTimeout((): void => {
                    timer = null;
                    self.close();

                    if (!doneCalled) {
                        self.done();
                    }
                }, timeout);
            }

            if (opts.progress !== false) {
                parent.updateProgress();
                interval = setInterval((): void => {
                    self.progress += 5;

                    parent.updateProgress();

                    if (self.progress > 95 && interval) {
                        clearInterval(interval);
                        interval = null;
                    }
                }, timeout / 20);
            }
        };
    }
}

class Browse implements MethodParent {
    /** Keys whose differing values are collected into a `<name>x` array instead of overwritten */
    specialEntryNames = 'name,data,LOCATION'.split(',');
    timeoutProgress: NodeJS.Timeout | null = null;
    adapter: DiscoveryAdapter;
    onFinished: (devices: DiscoveryDevice[]) => void;
    methodsArray: string[];
    count: number;
    foundCount: number;
    halt: Record<string, boolean>;

    constructor(
        adapter: DiscoveryAdapter,
        options: string[] | null | undefined,
        onFinished: (devices: DiscoveryDevice[]) => void,
    ) {
        this.adapter = adapter;
        this.onFinished = onFinished;
        this.adapter.config.stopPingOnTR064Ready = true;

        this.methodsArray = Object.keys(methods!).filter(m => methods![m].browse && (!options || options.includes(m)));

        this.count = this.methodsArray.length;
        this.foundCount = 0;
        this.halt = {};
        this.methodsArray.forEach(m => {
            const method = new Method(this.adapter, this.adapter.gDevices, m, this) as unknown as MethodInstance;
            methods![m] = method;
            method.browse(method);
        });

        if (!this.methodsArray.length) {
            this.done();
        }
    }

    updateProgress = (): void => {
        if (this.timeoutProgress) {
            return;
        }
        this.timeoutProgress = setTimeout((): void => {
            this.timeoutProgress = null;
            let value = 0;
            this.methodsArray.forEach(n => (value += (methods![n] as MethodInstance).progress));
            void this.adapter.setState('devicesProgress', Math.round(value / this.methodsArray.length), true);
            void this.adapter.setState('devicesFound', this.foundCount, true);
        }, 1000);
    };

    done = (method?: MethodInstance): void => {
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

            const devices: DiscoveryDevice[] = [];

            Object.keys(this.adapter.gDevices)
                .sort()
                .forEach(t =>
                    Object.keys(this.adapter.gDevices[t])
                        .sort()
                        .forEach(d => devices.push(this.adapter.gDevices[t][d])),
                );

            this.getMissedNames(devices, (): void => {
                devices.push({
                    _addr: '0.0.0.0',
                    _name: 'localhost',
                    _type: 'once',
                });
                this.onFinished(devices);
            });
        }
    };

    getMissedNames = (devices: DiscoveryDevice[], callback: () => void): void => {
        let cnt = 0;
        const doIt = (): void => {
            if (cnt >= devices.length) {
                return callback();
            }
            const dev = devices[cnt++];

            if (dev._name) {
                return doIt();
            }

            reverse(dev._addr, (err, hostnames): void => {
                // `_sddr` is a typo that has been in here since the beginning - it evaluates to
                // undefined, so a device without reverse DNS simply stays nameless.
                dev._name = !err && hostnames?.length ? hostnames[0] : dev._sddr;
                dev._dns = {
                    hostnames,
                };
                doIt();
            });
        };
        doIt();
    };

    addDevice = (newDevice: DiscoveryDevice, source: string, type: string): boolean | undefined => {
        let device: DiscoveryDevice;
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
                (old._upnp as unknown[]).push(newDevice._upnp);
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
            device = {} as DiscoveryDevice;
        }
        delete newDevice._new;

        const _merge = (dest: Record<string, any>, from: Record<string, any>): void => {
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

/**
 * Remember that a detection module claimed this device.
 *
 * The proposals themselves are collected globally in `options.newInstances`, which no longer
 * says which address they came from. `writeDeviceStates()` needs that link to show, per
 * device, which adapters would take it.
 *
 * @param device the device that was just tested
 * @param adapterName name of the detection module that reported a find
 */
function noteDetection(device: DiscoveryDevice, adapterName: string): void {
    device._detected ||= [];
    if (!device._detected.includes(adapterName)) {
        device._detected.push(adapterName);
    }
}

class DiscoveryAdapter extends Adapter {
    gDevices: DiscoveredDevices = {};
    isRunning = false;
    /** The proposals of the last scan that were not there before - see lib/notification.ts */
    lastNewProposals: DiscoveryInstance[] = [];
    /** Language of this installation, read from `system.config` with every scan */
    systemLanguage: ioBroker.Languages = 'en';
    adapters: Record<string, DetectionModule> = {};
    /** Timer of the scheduled scan, `null` while it is switched off */
    autoDetectTimer: NodeJS.Timeout | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'discovery',
            message: obj => this.processMessage(obj),
            ready: (): void => void this.onReady(),
            unload: callback => {
                if (this.autoDetectTimer) {
                    clearTimeout(this.autoDetectTimer);
                    this.autoDetectTimer = null;
                }
                if (this.isRunning) {
                    void this.setState('scanRunning', false, true);
                    this.isRunning = false;
                    this.haltAllMethods();
                    setTimeout((): void => callback?.(), 1000);
                } else if (callback) {
                    callback();
                }
            },
        });
    }

    /**
     * Load every detection module of `lib/adapters`.
     *
     * `repository` limits the result to adapters that actually exist in the active
     * repository, so that discovery never proposes something the user cannot install.
     */
    enumAdapters(repository: string[] | null): void {
        let dir: string[];
        try {
            dir = readdirSync(`${__dirname}/lib/adapters`);
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
                    this.adapters[aName] = require(moduleName) as DetectionModule;
                }
            }
        }
    }

    /** Load every discovery method of `lib/methods`; files starting with `_` are skipped */
    enumMethods(): void {
        const dir = readdirSync(`${__dirname}/lib/methods`);
        methods = {};
        for (let f = 0; f < dir.length; f++) {
            const parts = dir[f].split('.');
            if (parts[parts.length - 1] === 'js' && parts[0] !== '_') {
                parts.pop();
                methods[parts.join('.')] = require(`${__dirname}/lib/methods/${dir[f]}`) as MethodModule;
            }
        }
    }

    processMessage(obj: ioBroker.Message): void {
        if (!obj?.command) {
            return;
        }
        switch (obj.command) {
            case 'browse': {
                if (obj.callback) {
                    this.log.debug('Received "browse" event');
                    this.browse(obj.message as string[] | null, (error, newInstances, devices): void => {
                        this.log.debug('Browse finished');
                        void this.setState('scanRunning', false, true);
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
            case 'admin:getNotificationSchema':
            case 'getNotificationSchema': {
                // Admin hands the `contextData.admin.notification` of the notification back and
                // renders whatever jsonConfig comes out - see lib/notification.ts
                if (obj.callback) {
                    const message = (obj.message || {}) as { newInstances?: notification.ProposalSummary[] };
                    this.sendTo(
                        obj.from,
                        obj.command,
                        { schema: notification.notificationSchema(message.newInstances) },
                        obj.callback,
                    );
                }
                break;
            }
            case 'startBrowse': {
                // The button in the settings dialog. `browse` answers only when the scan is
                // over, which can take minutes and outlives any sendTo timeout - this one
                // starts the scan and answers straight away; the state components in the
                // dialog show how it goes.
                const message = (obj.message || {}) as { methods?: unknown };
                const methodList = discoveryStates.autoDetectMethods({ autoDetectMethods: message.methods });

                if (this.isRunning) {
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { result: 'A scan is already running' }, obj.callback);
                    }
                    break;
                }

                this.log.info(`Scan started from the settings (${methodList.join(', ')})`);
                this.browse(methodList, (error, newInstances): void => {
                    if (error) {
                        this.log.warn(`Scan failed: ${error as any}`);
                    } else {
                        this.log.info(`Scan finished, ${newInstances?.length || 0} instance(s) proposed`);
                    }
                    // a scan out of turn moves the schedule along with it
                    this.scheduleAutoDetect();
                });

                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { result: 'Scan started' }, obj.callback);
                }
                break;
            }
            case 'getMethodList': {
                // What the settings dialog offers for the scheduled scan. `listMethods` hands
                // out the raw modules, which the `selectSendTo` control cannot use - this one
                // answers the { label, value } pairs it expects.
                if (obj.callback) {
                    this.enumMethods();
                    const list = Object.keys(methods || {})
                        .filter(name => methods![name].browse)
                        .sort()
                        .map(name => ({ label: methods![name].source || name, value: name }));

                    this.sendTo(obj.from, obj.command, list, obj.callback);
                }
                break;
            }
            case 'listMethods': {
                if (obj.callback) {
                    this.log.debug('Received "listMethods" event');
                    // `methods` is an object, so `.length` is always undefined - the enumeration
                    // therefore runs on every call. Kept as is, it is cheap and idempotent.
                    if (!methods || !(methods as unknown as unknown[]).length) {
                        this.enumMethods();
                    }

                    this.sendTo(obj.from, obj.command, methods, obj.callback);
                }
                break;
            }
        }
    }

    isValidAdapter(adapterName: string, type: string | undefined, dependencies: boolean | undefined): boolean {
        if (!Object.prototype.hasOwnProperty.call(this.adapters, adapterName)) {
            return false;
        }
        const adapter = this.adapters[adapterName];

        if (typeof adapter.type === 'string' && adapter.type !== type) {
            return false;
        }
        if (typeof adapter.type === 'object' && !adapter.type.includes(type as string)) {
            return false;
        }
        return !!adapter.dependencies === dependencies;
    }

    forEachValidAdapter(
        device: DiscoveryDevice | string,
        dependencies: boolean | undefined,
        callback?: (adapter: DetectionModule, name: string) => void,
    ): number {
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

    analyseDeviceDependencies(
        device: DiscoveryDevice,
        options: DetectOptions,
        callback: (err?: unknown) => void,
    ): void {
        let count: number | false = this.forEachValidAdapter(device, true);
        const callbacks: Record<string, boolean> = {};

        // try all found adapter types (with dependencies)
        this.forEachValidAdapter(device, true, (_adapter, a): void => {
            let timeout: NodeJS.Timeout | null = setTimeout((): void => {
                timeout = null;
                if (count !== false && !--count) {
                    this.analyseDeviceDependencies(device, options, callback);
                    count = false;
                }
            }, this.adapters[a].timeout || 2000);

            const adpr = a;
            this.log.debug(`Test ${device._type} ${device._addr} ${adpr}`);
            // expected, that detect method will add to _instances one instance of a specific type or extend existing one
            this.adapters[adpr].detect(device._addr, device, options, (err, isFound /* , addr */): void => {
                if (callbacks[adpr]) {
                    this.log.error(`Double callback by "${adpr}"`);
                } else {
                    callbacks[adpr] = true;
                }

                if (isFound) {
                    this.log.debug(`Test ${device._type} ${device._addr} ${adpr} DETECTED!`);
                    noteDetection(device, adpr);
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
        });

        if (count === 0) {
            callback(null);
        }
    }

    analyseDeviceSerial(device: DiscoveryDevice, options: DetectOptions, list: string[], callback: () => void): void {
        if (!list?.length) {
            callback();
        } else {
            const adpr = list.shift() as string;
            this.log.debug(`Test ${device._addr} ${adpr}`);

            let done = false;
            let timeout: NodeJS.Timeout | null = setTimeout((): void => {
                timeout = null;
                this.analyseDeviceSerial(device, options, list, callback);
            }, this.adapters[adpr].timeout || 2000);

            try {
                // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                this.adapters[adpr].detect(device._addr, device, options, (_err, isFound /* , addr */): void => {
                    if (timeout) {
                        if (done) {
                            this.log.error(`Double callback by "${adpr}"`);
                        } else {
                            done = true;
                        }

                        clearTimeout(timeout);
                        timeout = null;
                        setTimeout((): void => this.analyseDeviceSerial(device, options, list, callback), 0);
                    }
                    if (isFound) {
                        this.log.debug(`Test ${device._addr} ${adpr} DETECTED!`);
                        noteDetection(device, adpr);
                    }
                });
            } catch (e) {
                options.log.error(`Cannot detect "${adpr}" on "${device._addr}": ${e}`);
                setTimeout((): void => this.analyseDeviceSerial(device, options, list, callback), 0);
            }
        }
    }

    /**
     * Run every detection module that matches this device.
     *
     * Serial ports are probed one module after the other because only one process may hold
     * the port; IP devices are probed in parallel. Modules with `dependencies` run in a
     * second pass, once the first one is finished.
     *
     * `addr` can be an IP address (192.168.1.1) or a serial port name (/dev/ttyUSB0, COM1)
     */
    analyseDevice(device: DiscoveryDevice, options: DetectOptions, callback: (err?: unknown) => void): void {
        let count: number | false = this.forEachValidAdapter(device, false);

        if (device._type === 'serial') {
            const list: string[] = [];
            this.forEachValidAdapter(device, false, (_adapter, aName): number => list.push(aName));
            this.analyseDeviceSerial(device, options, list, (): void =>
                this.analyseDeviceDependencies(device, options, callback),
            );
        } else {
            const callbacks: Record<string, boolean> = {};
            // try all found adapter types (first without dependencies)
            this.forEachValidAdapter(device, false, (_adapter, a): void => {
                const adpr = a;
                this.log.debug(`Test ${device._type} ${device._addr} ${adpr}`);

                let timeout: NodeJS.Timeout | null = setTimeout((): void => {
                    timeout = null;
                    if (count !== false && !--count) {
                        this.analyseDeviceDependencies(device, options, callback);
                        count = false;
                    }
                }, this.adapters[adpr].timeout || 2000);

                try {
                    // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                    this.adapters[adpr].detect(device._addr, device, options, (_err, isFound /* , addr */): void => {
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
                            noteDetection(device, adpr);
                        }
                    });
                } catch (e) {
                    this.log.error(`Cannot detect "${adpr}" on "${device._addr}": ${e}`);
                    if (count !== false && !--count) {
                        this.analyseDeviceDependencies(device, options, callback);
                        count = false;
                    }
                }
            });
            if (count === 0) {
                this.analyseDeviceDependencies(device, options, callback);
            }
        }
    }

    analyseDevices(
        devices: DiscoveryDevice[],
        options: DetectOptions,
        index: number,
        callback: ((err?: unknown) => void) | null,
    ): void {
        void this.setState('servicesProgress', Math.round((index * 100) / devices.length), true);
        void this.setState('instancesFound', options.newInstances.length, true);

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

            const callbacks: Record<string, boolean> = {};
            // add suggested adapters
            for (const a in this.adapters) {
                if (!Object.prototype.hasOwnProperty.call(this.adapters, a)) {
                    continue;
                }
                if (this.adapters[a].type !== 'advice') {
                    continue;
                }

                const adpr = a;
                try {
                    // expected, that detect method will add to _instances one instance of a specific type or extend existing one
                    this.adapters[adpr].detect(null, null, options, (_err, isFound, name): void => {
                        if (callbacks[adpr]) {
                            this.log.error(`Double callback by "${adpr}"`);
                        } else {
                            callbacks[adpr] = true;
                        }
                        if (isFound) {
                            this.log.debug(`Added suggested adapter: ${name}`);
                        }
                        if (!--count && callback) {
                            void this.setState('servicesProgress', 100, true);
                            void this.setState('instancesFound', options.newInstances.length, true);
                            callback(null);
                            callback = null;
                        }
                    });
                } catch (e) {
                    this.log.error(`Cannot detect suggested adapter: ${e}`);
                    count--;
                }
            }
            if (!count && callback) {
                void this.setState('servicesProgress', 100, true);
                void this.setState('instancesFound', options.newInstances.length, true);
                callback(null);
                callback = null;
            }
        } else {
            this.analyseDevice(devices[index], options, err => {
                err && this.log.error(`Error by analyse device: ${err as any}`);
                setTimeout((): void => this.analyseDevices(devices, options, index + 1, callback), 0);
            });
        }
    }

    getInstances(callback: (instances: DiscoveryInstance[]) => void): void {
        this.getObjectView(
            'system',
            'instance',
            { startkey: 'system.adapter.', endkey: 'system.adapter.香' },
            (err, doc): void => {
                if (err || !doc?.rows?.length) {
                    return callback?.([]);
                }
                const res: DiscoveryInstance[] = [];
                doc.rows.forEach(row => res.push(row.value));
                callback?.(res);
            },
        );
    }

    discoveryEnd(
        devices: DiscoveryDevice[],
        callback?: (error: unknown, newInstances?: DiscoveryInstance[], devices?: DiscoveryDevice[]) => void,
    ): void {
        this.log.info(`Found ${devices.length} addresses`);

        void this.getForeignObject('system.repositories', (_err, repo): void => {
            void this.getForeignObject('system.config', (_err, systemConfig): void => {
                let repository: string[] | null = null;
                // `activeRepo` is a string on older and a string list on newer js-controllers.
                // The original code used it as an object key directly, which stringifies a
                // one-element list to its only entry - `String()` reproduces exactly that.
                const activeRepo = systemConfig?.common?.activeRepo
                    ? String(systemConfig.common.activeRepo)
                    : undefined;
                if (repo?.native && activeRepo && repo.native.repositories?.[activeRepo]?.json) {
                    repository = Object.keys(repo.native.repositories[activeRepo].json);
                }

                // use only installed adapter if onlyLocal flag activated
                if (this.config.onlyLocal) {
                    repository = repository?.filter(a => getAdapterDir(a)) || null;
                }

                // Get the list of adapters with auto-discovery
                this.enumAdapters(repository);

                this.getInstances(instances => {
                    // `null` asks for every enum - the signature only knows the filtered form
                    this.getEnums(null as unknown as ioBroker.EnumList, (_err: unknown, enums?: unknown): void => {
                        // read language
                        void this.getForeignObject('system.config', (_err, obj): void => {
                            const options: DetectOptions = {
                                existingInstances: instances,
                                newInstances: [],
                                enums: enums as Record<string, ioBroker.EnumObject> | null,
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
                            this.analyseDevices(devices, options, 0, async (): Promise<void> => {
                                this.log.info(
                                    `Discovery finished. Found new or modified ${options.newInstances.length} instances`,
                                );

                                // read secret
                                const systemConfig = await this.getForeignObjectAsync('system.config');
                                const secret = systemConfig?.native?.secret || 'Zgfr56gFe87jJOM';

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
                                let obj: ioBroker.Object | null | undefined;
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
                                    } as ioBroker.Object;
                                }
                                const oldInstances = (obj.native.newInstances || []) as (DiscoveryInstance | string)[];
                                // before the acknowledge block below empties and rewrites this
                                // array: what does this scan propose that the one before did not?
                                this.lastNewProposals = notification.newProposals(oldInstances, options.newInstances);
                                this.systemLanguage = options.language;
                                obj.native.newInstances = options.newInstances;
                                obj.native.devices = devices;
                                obj.native.lastScan = new Date().getTime();
                                for (let j = oldInstances.length - 1; j >= 0; j--) {
                                    const old = oldInstances[j] as DiscoveryInstance;
                                    if (old.comment?.ack) {
                                        delete old.comment.ack;
                                        old._id = old._id.replace(/\.\d+$/, '');
                                        oldInstances[j] = JSON.stringify(old);
                                    } else {
                                        oldInstances.splice(j, 1);
                                    }
                                }

                                for (let i = 0; i < oldInstances.length; i++) {
                                    for (let n = 0; n < options.newInstances.length; n++) {
                                        const modified = JSON.parse(
                                            JSON.stringify(options.newInstances[n]),
                                        ) as DiscoveryInstance;
                                        modified._id = modified._id.replace(/\.\d+$/, '');
                                        if (oldInstances[i] === JSON.stringify(modified)) {
                                            options.newInstances[n].comment ||= {};
                                            options.newInstances[n].comment!.ack = true;
                                            break;
                                        }
                                    }
                                }

                                await this.setForeignObjectAsync('system.discovery', obj);

                                try {
                                    await this.writeDeviceStates(devices);
                                } catch (e) {
                                    // the scan result is already stored; a failed mirror must
                                    // not turn a successful scan into an error
                                    this.log.warn(`Cannot write the device states: ${e}`);
                                }

                                this.isRunning = false;
                                this.log.info('Discovery finished');
                                void this.setState('scanRunning', false, true);
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

    /**
     * Ask every running method to stop.
     *
     * Note that `Object.keys()` yields the method **names**, so `method.halt` is always
     * undefined and nothing is actually halted. Left as is - see the refactoring notes.
     */
    haltAllMethods(): void {
        if (methods) {
            Object.keys(methods).forEach(method => {
                // not final
                if (method && (method as unknown as MethodInstance).halt !== undefined) {
                    (method as unknown as MethodInstance).halt = true;
                }
            });
        }
    }

    /**
     * Mirror the devices of the last scan into this instance's own object tree.
     *
     * Until now a scan only wrote `system.discovery`, which the admin discovery dialog reads
     * while it is open and nothing else ever sees. These states make the result visible in the
     * object browser, usable in scripts and readable by vis.
     *
     * The tree shows the *last* scan, not a history: a channel whose device did not turn up
     * again is removed, so nothing stale is left claiming to be there.
     *
     * @param devices what the scan found
     */
    async writeDeviceStates(devices: DiscoveryDevice[]): Promise<void> {
        const wanted = discoveryStates.wantedChannels(devices);

        // drop the channels of devices that did not show up this time
        try {
            const existing = await this.getAdapterObjectsAsync();
            for (const channel of discoveryStates.staleChannels(Object.keys(existing), this.namespace, wanted)) {
                await this.delObjectAsync(`devices.${channel}`, { recursive: true });
            }
        } catch (e) {
            this.log.debug(`Cannot clean up the device tree: ${e}`);
        }

        if (wanted.size) {
            await this.setObjectNotExistsAsync('devices', {
                type: 'channel',
                common: { name: 'Devices found by the last scan' },
                native: {},
            });
        }

        const now = Date.now();
        for (const [id, device] of wanted) {
            await this.setObjectAsync(`devices.${id}`, {
                type: 'channel',
                common: { name: discoveryStates.deviceChannelName(device) },
                native: {},
            });

            for (const row of discoveryStates.deviceStateRows(device, now)) {
                await this.setObjectNotExistsAsync(`devices.${id}.${row.key}`, {
                    type: 'state',
                    common: {
                        name: row.label,
                        type: row.type,
                        role: row.role,
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateAsync(`devices.${id}.${row.key}`, { val: row.value, ack: true });
            }
        }

        await this.setStateAsync('lastScan', { val: now, ack: true });
        this.log.debug(`Wrote ${wanted.size} device(s) into the object tree`);
    }

    browse(
        options: string[] | null,
        callback?: (error: unknown, newInstances?: DiscoveryInstance[], devices?: DiscoveryDevice[]) => void,
    ): void {
        if (this.isRunning) {
            return callback?.('Yet running');
        }

        this.isRunning = true;
        this.gDevices = {};

        void this.setState('scanRunning', true, true);
        this.enumMethods();

        new Browse(this, options, devices => this.discoveryEnd(devices, callback));
    }

    /**
     * Arm the timer for the next scheduled scan.
     *
     * @param delay ms until the scan, defaults to the configured interval
     */
    scheduleAutoDetect(delay?: number): void {
        if (this.autoDetectTimer) {
            clearTimeout(this.autoDetectTimer);
            this.autoDetectTimer = null;
        }
        if (!this.config.autoDetect) {
            return;
        }

        const interval = discoveryStates.autoDetectMinutes(this.config) * 60000;
        this.autoDetectTimer = setTimeout(
            (): void => {
                this.autoDetectTimer = null;
                this.runAutoDetect();
            },
            delay === undefined ? interval : delay,
        );
    }

    /** Run one scheduled scan, then arm the timer again */
    runAutoDetect(): void {
        const methodList = discoveryStates.autoDetectMethods(this.config);

        if (this.isRunning) {
            // a scan started from the admin dialog is running - skip this turn rather than
            // queueing, the next one comes soon enough
            this.log.debug('Scheduled scan skipped, a scan is already running');
            return this.scheduleAutoDetect();
        }

        this.log.info(`Scheduled scan started (${methodList.join(', ')})`);
        this.browse(methodList, (error, newInstances): void => {
            if (error) {
                this.log.warn(`Scheduled scan failed: ${error as any}`);
            } else {
                this.log.info(`Scheduled scan finished, ${newInstances?.length || 0} instance(s) proposed`);
                void this.notifyNewProposals();
            }
            this.scheduleAutoDetect();
        });
    }

    /**
     * Tell the user about what a scheduled scan turned up.
     *
     * Nobody is watching a scan on a timer: admin subscribes to `system.discovery` only while
     * the discovery dialog is open, so without this the find of a nightly scan would sit in the
     * object until somebody happens to look. Only what is new since the scan before is worth a
     * notification - see `lib/notification.ts`.
     */
    async notifyNewProposals(): Promise<void> {
        const proposals = this.lastNewProposals;
        if (!proposals.length) {
            return;
        }

        try {
            await this.registerNotification(
                notification.NOTIFICATION_SCOPE,
                notification.NOTIFICATION_CATEGORY,
                notification.message(proposals.length, this.systemLanguage),
                {
                    contextData: {
                        admin: {
                            notification: {
                                offlineMessage: notification.OFFLINE_MESSAGE,
                                newInstances: notification.summarise(proposals),
                            },
                        },
                    },
                },
            );
            this.log.info(`Notified about ${proposals.length} new proposal(s)`);
        } catch (e) {
            // a notification is a nicety; a js-controller that cannot take it must not turn a
            // successful scan into a failed one
            this.log.warn(`Cannot register the notification: ${e}`);
        }
    }

    /**
     * Put `common.adminUI.config` right on an installation that predates the settings dialog.
     *
     * js-controller does not carry that nested field over on an update, so an adapter that was
     * installed while it still said `"none"` would never show a settings button - and the
     * scheduled scan could not be switched on. See `lib/migration.ts`.
     */
    async migrateAdminUi(): Promise<void> {
        for (const id of migration.adminUiObjectIds(this.namespace, this.name)) {
            try {
                const obj = await this.getForeignObjectAsync(id);
                // the typed `common` of an object union is narrower than what this repair
                // reads, so it is handed over as the loose shape lib/migration works with
                const common = obj?.common as unknown as migration.AdminUiCommon | undefined;
                if (!obj || !migration.needsAdminUiMigration(common)) {
                    continue;
                }

                const before = common?.adminUI?.config ?? 'unset';
                await this.extendForeignObjectAsync(id, migration.adminUiPatch(common));
                this.log.info(`Migrated ${id}: adminUI.config "${before}" -> "${migration.ADMIN_UI_CONFIG}"`);
            } catch (e) {
                // a failed repair must not keep the adapter from doing its actual work; the
                // settings dialog is then simply missing until the next update
                this.log.warn(`Cannot migrate adminUI.config of ${id}: ${e}`);
            }
        }
    }

    /** Everything that has to happen before the first scan can be scheduled */
    async onReady(): Promise<void> {
        await this.migrateAdminUi();
        this.main();
    }

    main(): void {
        void this.setState('scanRunning', false, true);
        // The values may arrive as strings from an old instance configuration
        this.config.pingTimeout = parseInt(this.config.pingTimeout as unknown as string, 10) || 1000;
        this.config.pingBlock = parseInt(this.config.pingBlock as unknown as string, 10) || 20;

        this.config.autoDetect = !!this.config.autoDetect;
        this.config.autoDetectInterval = discoveryStates.autoDetectMinutes(this.config);

        if (this.config.autoDetect) {
            const methodList = discoveryStates.autoDetectMethods(this.config);
            this.log.info(`Scheduled scan every ${this.config.autoDetectInterval} minutes (${methodList.join(', ')})`);
            // not right at start-up: the host is still busy and the network may not be up yet
            this.scheduleAutoDetect(discoveryStates.FIRST_AUTO_DETECT_DELAY);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined): DiscoveryAdapter => new DiscoveryAdapter(options);
} else {
    // otherwise start the instance directly
    ((): DiscoveryAdapter => new DiscoveryAdapter())();
}
