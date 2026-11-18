import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'sungrow-local';

// The Sungrow WiNet-S/WiNet-S2 communication module announces its web interface as
// `WiNet-WebServer._http._tcp.local` on the host `SUNGROW<serial>.local`. Its TXT record
// describes the plant, for example:
//   board=SUNGROW;1;WiNet-S2;B2400000001;1;
//   inverter=1;3622;A2400000001;1;516;SH20T;1;4;
//   battery1=2;200;8441;S2400000001;1;516;SBH400-V11;
//   ethinfo=192.168.20.40;
const WINET_INSTANCE = /^WiNet-WebServer\._http\._tcp\.local\.?$/i;
const reSungrowHost = /^SUNGROW[0-9A-Z]*\.local\.?$/i;

/**
 * The raw bytes of the TXT record.
 *
 * The first answer of an address keeps its Buffer. When the discovery core merges a later
 * answer into an existing device, it copies a Buffer byte by byte into a plain object, so
 * that shape has to be read as well.
 */
function txtBytes(device: DiscoveryDevice): Buffer | null {
    const raw = device._mdns?.TXT?.data;
    if (Buffer.isBuffer(raw)) {
        return raw;
    }
    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.data)) {
            return Buffer.from(raw.data as number[]);
        }
        const bytes: number[] = [];
        for (let i = 0; typeof raw[i] === 'number'; i++) {
            bytes.push(raw[i]);
        }
        return bytes.length ? Buffer.from(bytes) : null;
    }
    return null;
}

/** TXT record as key/value pairs; a TXT record is a sequence of length-prefixed strings */
function txtValues(device: DiscoveryDevice): Record<string, string> {
    const bytes = txtBytes(device);
    if (!bytes) {
        return tools.mdnsTxt(device);
    }
    const result: Record<string, string> = {};
    let pos = 0;
    while (pos < bytes.length) {
        const length = bytes[pos];
        if (!length || pos + 1 + length > bytes.length) {
            break;
        }
        const part = bytes.toString('utf8', pos + 1, pos + 1 + length);
        const eq = part.indexOf('=');
        if (eq > 0) {
            result[part.substring(0, eq)] = part.substring(eq + 1);
        }
        pos += 1 + length;
    }
    return result;
}

function announcesWiNet(device: DiscoveryDevice): boolean {
    return [...tools.mdnsValues(device, 'PTR', 'data'), ...tools.mdnsValues(device, 'SRV', 'name')].some(value =>
        WINET_INSTANCE.test(value),
    );
}

function isSungrow(device: DiscoveryDevice, txt: Record<string, string>): boolean {
    const target = device._mdns?.SRV?.data?.target;
    return (typeof target === 'string' && reSungrowHost.test(target)) || /^SUNGROW;/i.test(txt.board || '');
}

/**
 * An mDNS reflector (UniFi gateways, Avahi with `enable-reflector`) repeats the module's answers
 * from its own address, A record and TXT record included. The module names only its own address:
 * it sends no A record of its own, and `ethinfo` in its TXT record is its own address.
 */
function announcedBySelf(ip: string, device: DiscoveryDevice, txt: Record<string, string>): boolean {
    if (tools.mdnsValues(device, 'A', 'data').some(address => address !== ip)) {
        return false;
    }
    const own = (txt.ethinfo || '').split(';')[0];
    return !own || own === ip;
}

function label(ip: string, txt: Record<string, string>): string {
    const board = (txt.board || '').split(';');
    const inverter = (txt.inverter || '').split(';');
    const module = board[2] || 'WiNet';
    const model = inverter[5] ? `Sungrow ${inverter[5]}` : 'Sungrow inverter';
    return `${model} via ${module}${board[3] ? ` ${board[3]}` : ''} (${ip})`;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!announcesWiNet(device)) {
        return callback(null, false, ip);
    }
    const txt = txtValues(device);
    if (!isSungrow(device, txt) || !announcedBySelf(ip, device, txt)) {
        options.log.debug(`WiNet web server seen at ${ip}, but not announced by the module itself - ignored`);
        return callback(null, false, ip);
    }

    if (tools.findInstance(options, adapterName, instance => instance.native?.host === ip)) {
        // this WiNet is already configured (or proposed in this scan)
        return callback(null, false, ip);
    }

    const text = label(ip, txt);
    options.log.debug(`Sungrow WiNet module detected: ${text}`);
    // One instance per WiNet: the adapter keeps a single Modbus TCP connection to one host.
    // Only the address is filled in. The proposal starts read-only, as the adapter's README
    // advises for the first start; battery control and wallbox EMS stay at their default (off).
    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
        },
        native: {
            host: ip,
            readOnly: true,
        },
        comment: {
            add: [text],
        },
    });
    callback(null, true, ip);
}

export const type = ['mdns'];
export const timeout = 1500;
