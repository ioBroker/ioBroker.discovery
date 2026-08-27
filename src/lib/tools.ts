import type { DiscoveryLogger, DetectOptions, DiscoveryDevice, DiscoveryInstance, InstanceFilter } from './types';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import * as udp from 'node:dgram';
import * as http from 'node:http';
import * as https from 'node:https';
import type * as netModule from 'node:net';
import type * as serialportModule from 'serialport';
import { Netmask } from 'netmask';

export { translate, words } from './words';

let interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> | undefined;

/**
 * Find own IP address to communicate with another device
 *
 * The server/host can have several IP addresses, and to choose a valid one (e.g. to use in settings)
 * we must check all our IP addresses.
 *
 * @param ip ip address of a device that we want to connect to
 * @returns own ip address of the interface which we can use to communicate with a desired device
 */
export function getOwnAddress(ip: string): string {
    interfaces ||= networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const address of interfaces[name] || []) {
            if (address.family === 'IPv4') {
                const block1 = new Netmask(`${address.address}/${address.netmask}`);
                const block2 = new Netmask(`${ip}/${address.netmask}`);
                if (block1.base === block2.base) {
                    return address.address;
                }
            }
        }
    }
    return '0.0.0.0';
}

/** Gets all valid (not internal) IPv4 addresses of this host together with the interface name */
export function getIP4addresses(): { name: string; ip: string }[] {
    interfaces ||= networkInterfaces();
    const result: { name: string; ip: string }[] = [];

    for (const dev of Object.keys(interfaces)) {
        for (const details of interfaces[dev] || []) {
            if (!details.internal && details.family === 'IPv4') {
                result.push({ name: dev, ip: details.address });
            }
        }
    }
    return result;
}

/** Gets all IPv4 broadcast addresses this host can send to */
export function getBroadcastAddresses(): string[] {
    const net = networkInterfaces();
    return (
        Object.keys(net)
            .map(k => net[k] || [])
            .reduce<NetworkInterfaceInfo[]>((prev, cur): NetworkInterfaceInfo[] => prev.concat(cur), [])
            // only use external IPv4 ones
            .filter(add => !add.internal && add.family === 'IPv4')
            // extract address and subnet as arrays of numbers
            .map(k => ({
                address: k.address.split('.').map(num => +num),
                netmask: k.netmask.split('.').map(num => +num),
            }))
            // broadcast is address OR (not netmask)
            .map(add => add.address.map((val, i): number => (val | ~add.netmask[i]) & 0xff))
            // ignore unconnected ones
            .filter(add => add[0] !== 169)
            .map(a => `${a[0]}.${a[1]}.${a[2]}.${a[3]}`)
    );
}

/**
 * What `options.onReceive` may return:
 * - `true` => found, close the connection
 * - `false` / `undefined` => not found, close the connection
 * - `null` => keep listening, do not close
 */
export type PortReceiveResult = boolean | null | undefined;

export interface TestPortOptions {
    onConnect?: (ip: string, port: number, client: netModule.Socket) => void;
    onReceive?: (data: Buffer, ip: string, port: number, client: netModule.Socket) => PortReceiveResult;
}

export type TestPortCallback = (error: unknown, found: boolean, ip: string, port: number) => void;

/**
 * Test a TCP port of an IP address.
 *
 * Opens the port and, if `onConnect`/`onReceive` are given, lets the caller send a probe and
 * validate the answer.
 */
export function testPort(ip: string, port: number, callback: TestPortCallback): void;
export function testPort(ip: string, port: number, timeout: number, callback: TestPortCallback): void;
export function testPort(ip: string, port: number, options: TestPortOptions, callback: TestPortCallback): void;
export function testPort(
    ip: string,
    port: number,
    timeout: number,
    options: TestPortOptions,
    callback: TestPortCallback,
): void;
export function testPort(
    ip: string,
    port: number,
    timeout?: number | TestPortOptions | TestPortCallback,
    options?: TestPortOptions | TestPortCallback | null,
    callback?: TestPortCallback,
): void {
    const net = require('node:net') as typeof netModule;
    let client: netModule.Socket | null = new net.Socket();
    let timer: NodeJS.Timeout | null;

    // Runtime dispatch of the original JS signature - kept as is so that every call shape
    // used in lib/adapters keeps working.
    let cb: TestPortCallback | null;
    let opts: TestPortOptions;
    let ms: number;

    if (typeof timeout === 'object' && timeout !== null) {
        cb = options as TestPortCallback;
        opts = timeout;
        ms = 0;
    } else if (typeof timeout === 'function') {
        cb = timeout;
        opts = {};
        ms = 500;
    } else {
        ms = timeout || 0;
        if (typeof options === 'function') {
            cb = options;
            opts = {};
        } else {
            cb = callback || null;
            opts = options || {};
        }
    }
    ms = ms || 500;

    const finish = (found: boolean): void => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (cb) {
            cb(null, found, ip, port);
            cb = null;
        }
        if (client) {
            client.destroy();
            client = null;
        }
    };

    client.on('data', data => {
        let noDestroy: PortReceiveResult = false;
        if (opts.onReceive && client) {
            noDestroy = opts.onReceive(data, ip, port, client);
        }

        // `null` means "still watching" - everything else ends the probe
        if (noDestroy !== null) {
            finish(!!noDestroy);
        }
    });

    client.on('error', (): void => finish(false));

    timer = setTimeout((): void => {
        timer = null;
        finish(false);
    }, ms);

    client.connect(port, ip, (): void => {
        if (opts.onConnect && client) {
            opts.onConnect(ip, port, client);
        } else {
            finish(true);
        }
    });
}

const usedPorts: number[] = [];

/** Header set of an SSDP answer, e.g. `{ ST: 'urn:...', LOCATION: 'http://...' }` */
export type SsdpResult = Record<string, string>;

export type SsdpCallback = (
    error: unknown,
    result?: SsdpResult | boolean | [],
    ip?: string,
    xmlData?: string | null,
) => void;

export interface SsdpScanArguments {
    ip: string;
    text: string;
    readXml?: boolean;
    timeout?: number;
}

/**
 * Scan one device for UPnP services.
 *
 * Sends an SSDP M-SEARCH to the device and parses the answer into a header map. If
 * `readXml` is set and the answer carries a `LOCATION`, that document is fetched too and
 * handed to the callback as the fourth argument.
 */
export function ssdpScan(args: SsdpScanArguments, callback: SsdpCallback): void;
export function ssdpScan(ip: string, text: string, callback: SsdpCallback): void;
export function ssdpScan(ip: string, text: string, timeout: number, callback: SsdpCallback): void;
export function ssdpScan(ip: string, text: string, readXml: boolean, callback: SsdpCallback): void;
export function ssdpScan(ip: string, text: string, readXml: boolean, timeout: number, callback: SsdpCallback): void;
export function ssdpScan(
    ip: string,
    text: string,
    readXml: boolean,
    timeout: number,
    probePort: number,
    callback: SsdpCallback,
): void;
export function ssdpScan(
    ip: string | SsdpScanArguments,
    text?: string | SsdpCallback,
    readXml?: boolean | number | SsdpCallback,
    timeout?: number | SsdpCallback,
    probePort?: number | SsdpCallback,
    callback?: SsdpCallback,
): void {
    // Runtime dispatch of the original JS signature
    let cb: SsdpCallback | null = callback || null;
    let target: string;
    let filter: string;
    let withXml = false;
    let ms: number | undefined;
    let sendTo: number | undefined;

    if (typeof ip === 'object') {
        cb = text as SsdpCallback;
        filter = ip.text;
        withXml = !!ip.readXml;
        ms = ip.timeout;
        target = ip.ip;
    } else {
        target = ip;
        filter = text as string;
        if (typeof readXml === 'function') {
            cb = readXml;
        } else if (typeof readXml === 'number') {
            ms = readXml;
        } else {
            withXml = !!readXml;
        }
        if (typeof timeout === 'function') {
            cb = timeout;
        } else if (typeof timeout === 'number') {
            ms = timeout;
        }
        if (typeof probePort === 'function') {
            cb = probePort;
        } else if (typeof probePort === 'number') {
            sendTo = probePort;
        }
    }
    const timeoutMs = ms || 1000;
    const port1900 = sendTo || 1900;

    let socket: udp.Socket | null = udp.createSocket('udp4');
    let timer: NodeJS.Timeout | null;
    let port = 19140;
    while (usedPorts.includes(port)) {
        port++;
    }
    usedPorts.push(port);

    const releasePort = (): void => {
        const pos = usedPorts.indexOf(port);
        if (pos !== -1) {
            usedPorts.splice(pos, 1);
        }
    };
    const closeSocket = (): void => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (socket) {
            socket.close();
            socket = null;
        }
    };

    socket.on('error', (): void => {
        releasePort();
        closeSocket();
        if (cb) {
            cb(null, []);
            cb = null;
        }
    });

    socket.on('message', msg => {
        releasePort();
        closeSocket();

        if (typeof cb !== 'function') {
            return;
        }
        const answer = (msg ? msg.toString() : '').replace(/\r\n/g, '\n');
        const result: SsdpResult = {};
        for (const line of answer.split('\n')) {
            const pos = line.indexOf(':');
            if (pos !== -1) {
                result[line.substring(0, pos)] = line.substring(pos + 1).trim();
            } else {
                result[line] = '';
            }
        }

        if (withXml && result.LOCATION) {
            httpGet(result.LOCATION, timeoutMs, (err, data): void => {
                cb?.(err, result, target, data);
                cb = null;
            });
        } else {
            cb(null, result, target);
            cb = null;
        }
    });

    socket.bind(port);
    const probe = Buffer.from(filter);
    socket.send(probe, 0, probe.length, port1900, target);

    timer = setTimeout((): void => {
        releasePort();
        timer = null;
        closeSocket();
        if (cb) {
            // Note the shape: on timeout the second argument is `false`, not a header map.
            cb(null, false, target);
            cb = null;
        }
    }, timeoutMs);
}

export type UdpScanCallback = (error: unknown, message: string | null, remote?: udp.RemoteInfo) => void;

/**
 * Send one UDP probe and report the answer(s).
 *
 * With `onlyOneResult` (the default) the socket is closed after the first answer, otherwise
 * the callback keeps firing until `timeout` elapses.
 */
export function udpScan(
    probeAddress: string,
    probePort: number,
    listenAddress: string,
    listenPort: number,
    probeData: string | Buffer,
    timeout: number,
    onlyOneResult: boolean | UdpScanCallback,
    callback?: UdpScanCallback,
): void {
    let cb: UdpScanCallback | null;
    let single: boolean;
    if (typeof onlyOneResult !== 'boolean') {
        cb = onlyOneResult;
        single = true;
    } else {
        cb = callback || null;
        single = onlyOneResult;
    }

    const data = Buffer.isBuffer(probeData) ? probeData : Buffer.from(probeData);
    const udpSocket = udp.createSocket({ type: 'udp4', reuseAddr: true });

    const probeTimeout = setTimeout((): void => {
        udpSocket.close();
        cb?.(null, null);
        cb = null;
    }, timeout);

    udpSocket.on('error', err => {
        clearTimeout(probeTimeout);
        try {
            udpSocket.close();
        } catch {
            // ignore
        }
        console.log(`ERROR udpSocket: ${err}`);
        cb?.(err, null);
        cb = null;
    });

    udpSocket.bind(listenPort, listenAddress, (): void => {
        try {
            udpSocket.addMembership('224.0.0.1');
            udpSocket.setBroadcast(true);
        } catch (e) {
            udpSocket.emit('error', e);
        }
    });

    udpSocket.on('message', (message, remote): void => {
        console.log(`UDP Discovery response: ${remote.address}:${remote.port} - ${message.toString()}`);
        if (single) {
            clearTimeout(probeTimeout);
            try {
                udpSocket.close();
            } catch {
                // ignore
            }
        }
        cb?.(null, message.toString(), remote);
        if (single) {
            cb = null;
        }
    });

    udpSocket.on('listening', (): void => {
        try {
            udpSocket.send(data, 0, data.length, probePort, probeAddress);
        } catch {
            // ignore
        }
    });
}

/**
 * Find an enum whose name matches `name`, in any language.
 *
 * Returns the enum id, or `undefined`/`false` when nothing matches - the detection modules
 * only ever check it for truthiness.
 */
export function checkEnumName(enums: Record<string, any> | null | undefined, name: string): string | undefined | false {
    if (!enums || typeof enums !== 'object') {
        return false;
    }
    return Object.keys(enums).find(enumId => {
        const item = enums[enumId] as ioBroker.EnumObject & { name?: unknown };
        if (item.common.name === name || (name && item.name === name)) {
            return true;
        }
        if (item.common.name && typeof item.common.name === 'object') {
            const translated = item.common.name as Record<string, string>;
            return !!Object.keys(translated).find(lang => translated[lang] === name);
        }
        if (item.name && typeof item.name === 'object') {
            const translated = item.name as Record<string, string>;
            return !!Object.keys(translated).find(lang => translated[lang] === name);
        }
        return false;
    });
}

/** Build the next free `system.adapter.<name>.<n>` id, counting proposals and existing instances */
export function getNextInstanceID(name: string, options: DetectOptions): string {
    const instances: number[] = [];
    const prefixLength = `system.adapter.${name}.`.length;

    for (const instance of options?.newInstances || []) {
        if (instance.common && instance.common.name === name) {
            instances.push(parseInt(instance._id.substring(prefixLength), 10));
        }
    }
    for (const instance of options?.existingInstances || []) {
        if (instance.common && instance.common.name === name) {
            instances.push(parseInt(instance._id.substring(prefixLength), 10));
        }
    }

    let instance = 0;
    while (instances.includes(instance)) {
        instance++;
    }
    return `system.adapter.${name}.${instance}`;
}

/**
 * Find an instance of `name` that `compare` accepts.
 *
 * An **existing** instance is returned as a deep copy flagged with `_existing`, so that a
 * detection module can extend it without touching the real object. A proposal from
 * `newInstances` is returned as is, because extending it is the whole point.
 */
export function findInstance(options: DetectOptions, name: string, compare?: InstanceFilter): DiscoveryInstance | null {
    for (const existing of options.existingInstances) {
        if (existing.common && existing.common.name === name && (!compare || compare(existing))) {
            const instance = JSON.parse(JSON.stringify(existing)) as DiscoveryInstance; // do not modify existing instance
            instance._existing = true;
            return instance;
        }
    }

    for (const proposal of options.newInstances) {
        if (proposal.common && proposal.common.name === name && (!compare || compare(proposal))) {
            return proposal;
        }
    }
    return null;
}

export type HttpGetCallback = (error: unknown, result: string | null, link: string) => void;

/**
 * Read an HTTP(S) page. Without a callback a promise is returned instead.
 */
export function httpGet(link: string, timeout?: number): Promise<string | null>;
export function httpGet(link: string, callback: HttpGetCallback): void;
export function httpGet(link: string, timeout: number, callback: HttpGetCallback): void;
export function httpGet(
    link: string,
    timeout?: number | HttpGetCallback,
    callback?: HttpGetCallback,
): Promise<string | null> | void {
    const HTTP = link && link.startsWith('https') ? https : http;

    let cb: HttpGetCallback | null;
    let ms: number;
    if (typeof timeout === 'function') {
        cb = timeout;
        ms = 500;
    } else {
        cb = callback || null;
        ms = timeout || 500;
    }

    if (!cb) {
        return new Promise((resolve, reject): void => {
            httpGet(link, ms, (err, res): void => {
                if (err) {
                    reject(err instanceof Error ? err : new Error(String(String(err as any))));
                } else {
                    resolve(res);
                }
            });
        });
    }
    ms = parseInt(ms as unknown as string, 10) || 500;

    if (!link) {
        cb('error: no link provided', null, link);
        cb = null;
    }

    try {
        const req = HTTP.get(link, res => {
            const statusCode = res.statusCode;

            if (statusCode !== 200) {
                // consume response data to free up memory
                res.resume();
                // Legacy behaviour: the callback is NOT cleared here, so a non-200 answer that
                // still carries a body reports twice. Kept as is.
                cb?.(statusCode, null, link);
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', chunk => (rawData += chunk));
            res.on('end', (): void | undefined => cb?.(null, rawData ? rawData.toString() : null, link));
        }).on('error', e => cb?.(e.message, null, link));

        req.setTimeout(ms, (): void => {
            req.destroy();
            cb?.('timeout', null, link);
            cb = null;
        });
    } catch (err) {
        cb?.(`error: ${err}`, null, link);
        cb = null;
    }
}

const serialDebug = false;

/** Options of `testSerialPort()` - passed straight on to the `SerialPort` constructor */
export interface SerialPortOptions {
    log: DiscoveryLogger;
    timeout?: number;
    [key: string]: any;
}

export type SerialOpenHandler = (port: any, callback: (error?: unknown) => void) => void;
export type SerialReceiveHandler = (
    port: any,
    data: Buffer,
    callback: (error: unknown, found?: boolean, isStop?: boolean, someInfo?: string) => void,
) => void;
export type SerialCallback = (
    error: unknown,
    isFound: boolean,
    portName: string,
    foundBaudrate?: number | number[],
    receivedText?: string,
) => void;

/**
 * Probe a serial port for a device.
 *
 * `baudRates` may be a single rate or a list - a list is tried one rate after the other
 * until one answers.
 */
export function testSerialPort(
    name: string,
    options: SerialPortOptions,
    baudRates: number | number[],
    onOpen: SerialOpenHandler | null,
    onReceived: SerialReceiveHandler | null,
    callback: SerialCallback,
): void {
    if (typeof baudRates === 'object') {
        if (!baudRates || !baudRates.length) {
            serialDebug && options.log.error(`------------------- <<< <<< <<< <0< testSerialPort "${name}`);
            serialDebug && options.log.warn(`Stop scan port ${name}`);
            callback('not found', false, name);
        } else {
            const baudRate = baudRates.shift() as number;
            serialDebug && options.log.warn(`Call port ${name} ${baudRate}`);
            if (serialDebug && !options.__done) {
                options.__done = true;
                options.log.error(`------------------- >>> >>> >>> >>> testSerialPort "${name}`);
            }
            testSerialPort(
                name,
                options,
                baudRate,
                onOpen,
                onReceived,
                (err, found, portName, baudrate, someInfo): void => {
                    if (found) {
                        serialDebug &&
                            options.log.error(`------------------- <<< <<< <<< <1< testSerialPort "${portName}`);
                        callback(null, true, portName, baudrate, someInfo);
                    } else {
                        setTimeout(testSerialPort, 0, name, options, baudRates, onOpen, onReceived, callback);
                    }
                },
            );
        }
        return;
    }

    serialDebug && options.log.error(`------------------- >>> >>> >>> >>> >>> testSerialPort "${name} - ${baudRates}`);
    let timeout: NodeJS.Timeout | null = null;
    let closing = false;
    let closePort: ((code: number, found?: boolean) => void) | undefined;
    let cb: SerialCallback | null = callback;

    try {
        serialDebug && options.log.warn(`Open port ${name}`);
        // `serialport` is an optional dependency - required lazily so that a host without the
        // native module can still run every other discovery method.
        const { SerialPort } = require('serialport') as typeof serialportModule;

        options.autoOpen = false;
        options.baudRate = parseInt(baudRates as unknown as string, 10);
        options.timeout = options.timeout || 1000;
        options.path = name;

        let port: any = new SerialPort(options as any);

        closePort = (code: number, found?: boolean): void => {
            if (closing) {
                return;
            }
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            try {
                if (port && port.isOpen) {
                    serialDebug && options.log.debug(`${new Date().toString()} close port ${name} ${baudRates}`);
                    closing = true;
                    port.close((): void => {
                        if (cb) {
                            serialDebug &&
                                options.log.error(
                                    `------------------- <<< <<< <<< <<< <${code}< testSerialPort "${name} - ${baudRates}`,
                                );
                            cb('timeout', found || false, name, baudRates);
                            cb = null;
                        }
                    });
                    port = null;
                    return;
                }
            } catch (e) {
                serialDebug && options.log.warn(`Cannot close port ${name}: ${e}`);
            }
            port = null;
            if (cb) {
                serialDebug &&
                    options.log.error(
                        `------------------- <<< <<< <<< <<< 1${code}< testSerialPort "${name} - ${baudRates}`,
                    );
                cb(null, found || false, name, baudRates);
                cb = null;
            }
        };

        // the open event will always be emitted
        port.on('open', (): void => {
            serialDebug && options.log.warn(`port ${name} opened: ${options.baudRate}`);

            if (onOpen) {
                onOpen(port, err => {
                    if (err) {
                        // immediately close
                        closePort?.(1);
                    } else {
                        // wait for answer
                        timeout = setTimeout(closePort as (...args: any[]) => void, options.timeout, 1, false);
                    }
                });
            } else {
                closePort?.(2, true);
            }
        });

        port.on('data', (data: Buffer): void => {
            if (onReceived) {
                try {
                    onReceived(port, data, (err, found, isStop /* , someInfo */): void => {
                        if (err || isStop || found) {
                            closePort?.(3, found);
                        }
                    });
                } catch (e) {
                    serialDebug && options.log.warn(`Cannot onReceive port ${name}: ${e}`);
                    closePort?.(4);
                }
            } else {
                closePort?.(5, true);
            }
        });

        port.on('error', (err: unknown): void => {
            if (err) {
                serialDebug && options.log.error(`Error on port ${name}: ${String(err as any)}`);
                closePort?.(6);
            }
        });

        port.open((err: unknown): void => {
            if (err) {
                serialDebug && options.log.warn(`Cannot open port, ${name}: ${String(err as any)}`);
                closePort?.(7);
            }
        });
    } catch (err) {
        serialDebug && options.log.error(`Cannot open_ port ${name}: ${err}`);
        closePort && closePort(8);
    }
}

export type LocationDescCallback = (error: unknown, data?: string | null) => void;

/**
 * Read the UPnP location description of a device and remember it on the device object.
 *
 * Note the asymmetry between `_locationDesc` (read) and `w_locationDesc` (written): the
 * cache never hits, every call issues the HTTP request again. Kept as is - see the
 * refactoring notes.
 */
export function getLocationDesc(device: DiscoveryDevice, callback: LocationDescCallback): void;
export function getLocationDesc(
    device: DiscoveryDevice,
    locationUrl: string | undefined,
    callback: LocationDescCallback,
): void;
export function getLocationDesc(
    device: DiscoveryDevice,
    locationUrl?: string | LocationDescCallback,
    callback?: LocationDescCallback,
): void {
    let cb: LocationDescCallback | undefined;
    let url: string | undefined;
    if (typeof locationUrl === 'function') {
        cb = locationUrl;
        url = undefined;
    } else {
        cb = callback;
        url = locationUrl;
    }

    if (device._locationDesc) {
        return cb?.(0, device._locationDesc);
    }
    const upnp = device._upnp;
    if (!url && upnp && upnp.LOCATION) {
        url = upnp.LOCATION as string;
    }

    if (!url) {
        return cb?.('no location url');
    }

    httpGet(url, 2000, (err, data): void => {
        if (!err && data) {
            device.w_locationDesc = data;
        }
        cb?.(err, data);
    });
}

/** Tests if `str` starts with `search` */
export function startsWith(str: string, search: string): boolean {
    return str.substring(0, search.length) === search;
}
