import * as tools from '../tools';
import * as openccuLite from '../openccu-lite';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance } from '../types';

/** One interface process of a CCU, as it answers on its classic RPC port */
interface Daemon {
    port: number;
    /** The port the hm-rpc instance listens on for the callbacks */
    callbackPort: number;
    type: 'bin' | 'xml';
    daemon: string;
    title: string;
    comment: string;
    /** `false`: an open port is enough, the process is not asked for its version */
    getVersion: boolean;
    /** The interface's name on openccu-lite, where it has one */
    liteInterface?: string;
}

const DAEMONS: Daemon[] = [
    {
        port: 2000,
        callbackPort: 12000,
        type: 'bin',
        daemon: 'hs485d',
        title: 'HomeMatic hs485d',
        comment: 'hs485d',
        getVersion: true,
        liteInterface: 'BidCos-Wired',
    },
    {
        port: 2001,
        callbackPort: 12001,
        type: 'bin',
        daemon: 'rfd',
        title: 'HomeMatic Wireless',
        comment: 'Wireless RF',
        getVersion: true,
        liteInterface: 'BidCos-RF',
    },
    {
        port: 8701,
        callbackPort: 18701,
        type: 'bin',
        daemon: 'CUxD',
        title: 'HomeMatic CuxD',
        comment: 'CUxD',
        getVersion: false,
    },
    {
        port: 2010,
        callbackPort: 12010,
        type: 'xml',
        daemon: 'HMIP',
        title: 'HomeMatic HMIP',
        comment: 'HMIP',
        getVersion: true,
        liteInterface: 'HmIP-RF',
    },
];

/** The `daemon` of an hm-rpc instance in openccu-lite mode */
export const LITE_DAEMON = 'openccu-lite';

/** The classic `daemon` that reaches the same interface - an instance of it covers the interface too */
const CLASSIC_DAEMON: Record<string, string> = {
    'BidCos-Wired': 'hs485d',
    'BidCos-RF': 'rfd',
    'HmIP-RF': 'HMIP',
    VirtualDevices: 'virtual-devices',
};

/**
 * The interfaces proposed for an openccu-lite system that does not name them in its version
 * answer (an older system) and whose classic ports did not show them either: these two are what its
 * usual radio modules run. The user unticks what the system lacks.
 */
export const DEFAULT_LITE_INTERFACES = ['HmIP-RF', 'BidCos-RF'];

/** Budget of the openccu-lite probe, the redirect to HTTPS included */
const LITE_PROBE_TIMEOUT = 2000;

const PAIRING_HINT =
    'Pair the instance with the system in its settings - the request is approved on the Status page of openccu-lite';
const NO_PAIRING_HINT =
    'Pairing is switched off on this openccu-lite: create a token on its Remote access page and enter it in the instance settings';

function getVersionRequest(ip: string, port: number): string {
    return (
        `POST / HTTP/1.1\r\n` +
        `User-Agent: NodeJS XML-RPC Client\r\n` +
        `Content-Type: text/xml\r\n` +
        `Accept: text/xml\r\n` +
        `Accept-Charset: UTF8\r\n` +
        `Connection: Keep-Alive\r\n` +
        `Content-Length: 98\r\n` +
        `Host: ${ip}:${port}\r\n` +
        `\r\n` +
        `<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>`
    );
}

function isThisHost(instance: DiscoveryInstance, ip: string, device: DiscoveryDevice): boolean {
    return instance.native.homematicAddress === ip || instance.native.homematicAddress === device._name;
}

/** The classic proposals, exactly as before openccu-lite was known */
function proposeClassic(
    ip: string,
    device: DiscoveryDevice,
    name: string,
    open: Daemon[],
    options: DetectOptions,
): boolean {
    let someFound = false;
    for (const d of DAEMONS) {
        if (!open.includes(d)) {
            continue;
        }
        const instance = tools.findInstance(
            options,
            'hm-rpc',
            obj => isThisHost(obj, ip, device) && obj.native.homematicPort === d.port,
        );
        if (instance) {
            continue;
        }
        options.newInstances.push({
            _id: tools.getNextInstanceID('hm-rpc', options),
            common: {
                name: 'hm-rpc',
                title: `${d.title} (${name})`,
            },
            native: {
                homematicAddress: ip,
                adapterAddress: tools.getOwnAddress(ip),
                homematicPort: d.port,
                port: d.callbackPort,
                type: d.type,
                daemon: d.daemon,
            },
            comment: {
                add: [`${d.comment} (${name})`],
            },
        });
        someFound = true;
    }
    return someFound;
}

/**
 * The proposals for an openccu-lite system: one hm-rpc instance per interface in openccu-lite
 * mode, never a classic one - those would need `init`, which the system does not forward.
 *
 * The interfaces are the ones the version answer names; for a system whose answer does not name
 * them, the ones whose classic port answered (classic RPC switched on without a password), else
 * `DEFAULT_LITE_INTERFACES`. The token cannot be discovered: the user pairs the new instance in
 * its settings.
 */
function proposeLite(
    ip: string,
    device: DiscoveryDevice,
    name: string,
    system: openccuLite.OpenccuLiteSystem,
    open: Daemon[],
    options: DetectOptions,
): boolean {
    const version = openccuLite.rpcApiVersion(system.info);
    if (version !== undefined && version !== 1) {
        options.log.debug(`openccu-lite at ${ip} speaks lite-rpc ${version}, which hm-rpc does not know yet`);
        return false;
    }

    const named = openccuLite.interfacesOf(system.info);
    const seen = DAEMONS.filter(d => d.liteInterface && open.includes(d)).map(d => d.liteInterface as string);
    const interfaces = named ?? (seen.length ? seen : DEFAULT_LITE_INTERFACES);
    const text = openccuLite.pairingAllowed(system.info) ? PAIRING_HINT : NO_PAIRING_HINT;

    let someFound = false;
    for (const iface of interfaces) {
        const classic = CLASSIC_DAEMON[iface];
        const instance = tools.findInstance(
            options,
            'hm-rpc',
            obj =>
                isThisHost(obj, ip, device) &&
                (obj.native.daemon === LITE_DAEMON
                    ? obj.native.liteInterface === iface
                    : !!classic && obj.native.daemon === classic),
        );
        if (instance) {
            continue;
        }
        options.newInstances.push({
            _id: tools.getNextInstanceID('hm-rpc', options),
            common: {
                name: 'hm-rpc',
                title: `HomeMatic ${iface} (openccu-lite, ${name})`,
            },
            native: {
                daemon: LITE_DAEMON,
                homematicAddress: ip,
                homematicPort: system.port,
                useHttps: system.https,
                type: 'xml',
                liteInterface: iface,
            },
            comment: {
                add: [`${iface} (openccu-lite, ${name})`],
                text,
            },
        });
        someFound = true;
    }
    return someFound;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // The classic RPC ports and openccu-lite's version answer are asked at the same time, and
    // nothing is proposed before both are in: an openccu-lite with classic RPC switched on
    // answers on the classic ports too, and must not get the classic proposals.
    const name = ip + (device._name && device._name !== ip ? ` - ${device._name}` : '');
    const open: Daemon[] = [];
    let system: openccuLite.OpenccuLiteSystem | null = null;
    let count = DAEMONS.length + 1;

    const settle = (): void => {
        if (--count) {
            return;
        }
        const found = system
            ? proposeLite(ip, device, name, system, open, options)
            : proposeClassic(ip, device, name, open, options);
        callback(null, found, ip);
    };

    for (const d of DAEMONS) {
        const onResult = (_err: unknown, found: boolean): void => {
            if (found) {
                open.push(d);
            }
            settle();
        };
        if (d.getVersion) {
            tools.testPort(
                ip,
                d.port,
                {
                    onConnect: (ip, port, client): void => {
                        client.write(getVersionRequest(ip, port));
                    },
                    onReceive: data => data && !!data.toString().match(/<value>[.\d]+<\/value>/),
                },
                onResult,
            );
        } else {
            tools.testPort(ip, d.port, onResult);
        }
    }

    openccuLite.probe(ip, LITE_PROBE_TIMEOUT, (result): void => {
        system = result;
        settle();
    });
}

export const type = ['ip']; // make type=serial for USB sticks
// The openccu-lite probe may take its whole budget - a redirect and a TLS handshake with a Pi
export const timeout = LITE_PROBE_TIMEOUT + 500;
