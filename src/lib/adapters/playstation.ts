import * as dgram from 'node:dgram';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'playstation';

/**
 * PS4 and PS5, over Sony's device discovery protocol.
 *
 * Everything below comes from `playactor-iobroker`, the library the adapter drives the
 * console with: `formatDiscoveryMessage()` builds `"<type> * HTTP/1.1\n...device-discovery-
 * protocol-version:<version>\n"`, `wakePortsByType` gives 987 for the PS4 and 9302 for the
 * PS5, and `DiscoveryVersions` the two protocol versions. `parseMessage()` reads the answer:
 * a status line starting with HTTP - 200 when awake, 620 in standby - and then the headers
 * `host-id`, `host-name` and `host-type`.
 *
 * The adapter also uses mDNS, but only to notice that a known address is alive again; finding
 * a console is this protocol's job.
 */
const CONSOLES: { type: string; port: number; version: string }[] = [
    { type: 'PS4', port: 987, version: '00020020' },
    { type: 'PS5', port: 9302, version: '00030010' },
];
const PROBE_TIMEOUT = 1200;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than both probes together
const DETECT_TIMEOUT = CONSOLES.length * PROBE_TIMEOUT + 300;

/**
 * The SRCH datagram for one console generation.
 *
 * @param version the discovery protocol version of that generation
 */
export function searchMessage(version: string): Buffer {
    return Buffer.from(`SRCH * HTTP/1.1\ndevice-discovery-protocol-version:${version}\n`);
}

export interface ConsoleInfo {
    status: 'AWAKE' | 'STANDBY';
    id?: string;
    name?: string;
    type?: string;
}

/**
 * Read the answer of a console.
 *
 * @param raw the datagram
 */
export function parseConsoleAnswer(raw: string): ConsoleInfo | null {
    const lines = raw.split('\n');
    const statusLine = lines.shift();
    if (!statusLine?.startsWith('HTTP')) {
        return null;
    }
    // "HTTP/1.1 200 Ok" or "HTTP/1.1 620 Server Standby"
    const code = statusLine.split(' ')[1];
    if (code !== '200' && code !== '620') {
        return null;
    }

    const headers: Record<string, string> = {};
    for (const line of lines) {
        const [key, value] = line.split(/:[ ]*/);
        if (value) {
            headers[key.trim().toLowerCase()] = value.trim();
        }
    }
    // without a host id this is some other service that happens to answer in HTTP
    if (!headers['host-id']) {
        return null;
    }

    return {
        status: code === '620' ? 'STANDBY' : 'AWAKE',
        id: headers['host-id'],
        name: headers['host-name'],
        type: headers['host-type'],
    };
}

function addInstance(ip: string, info: ConsoleInfo, options: DetectOptions): boolean {
    const name = info.name || info.type || 'PlayStation';

    const before = options.newInstances.length;
    let instance = tools.pendingProposal(options, adapterName);

    if (!instance) {
        instance = tools.findInstance(options, adapterName, obj =>
            (obj.native.ps || []).some((entry: ProtocolData) => entry?.ip === ip),
        );
        if (instance) {
            options.log.info(`playstation adapter already present for ${ip}`);
            return false;
        }

        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: { name: adapterName },
            native: { ps: [] },
            comment: { add: [] },
        };
        options.newInstances.push(instance);
    }

    instance.native.ps ||= [];
    const consoles = instance.native.ps as ProtocolData[];

    if (!consoles.some(entry => entry?.ip === ip)) {
        // the shape of one row of the adapter's console table
        consoles.push({ active: true, ps4name: name, ip, interval: 5, icon: '', credential: '' });
        (instance.comment!.add as string[]).push(`${info.type || 'PlayStation'} ${name} (${ip})`);
    }

    // the console has to be paired once; the adapter does that itself but needs a PSN account
    instance.comment!.inputs ||= [
        { name: 'native.npsso', def: '', type: 'password', title: 'PSN npsso token (for the online data)' },
    ];

    return before !== options.newInstances.length;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const probe = (rest: typeof CONSOLES): void => {
        const console = rest.shift();
        if (!console) {
            return callback(null, false, ip);
        }

        const socket = dgram.createSocket('udp4');
        let done = false;
        let timer: NodeJS.Timeout | null = null;

        const finish = (info: ConsoleInfo | null): void => {
            if (done) {
                return;
            }
            done = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            try {
                socket.close();
            } catch {
                // never bound
            }

            if (!info) {
                return probe(rest);
            }
            options.log.debug(`${info.type || 'PlayStation'} detected at ${ip} (${info.status})`);
            callback(null, addInstance(ip, info, options), ip);
        };

        timer = setTimeout((): void => finish(null), PROBE_TIMEOUT);
        socket.on('error', (): void => finish(null));
        socket.on('message', (message): void => finish(parseConsoleAnswer(message.toString('utf8'))));

        const request = searchMessage(console.version);
        socket.send(request, 0, request.length, console.port, ip, (err): void => {
            if (err) {
                finish(null);
            }
        });
    };

    probe([...CONSOLES]);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
