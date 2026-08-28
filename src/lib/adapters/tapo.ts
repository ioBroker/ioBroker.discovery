import * as dgram from 'node:dgram';
import { generateKeyPairSync } from 'node:crypto';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'tapo';

/**
 * TP-Link's device discovery, taken from the adapter's own `lib/utils/udpDiscovery.js`: a
 * 16 byte header followed by `{"params":{"rsa_key":"<PEM>"}}` goes to UDP 20002, and the
 * device answers with the same header in front of a plain JSON body naming itself.
 *
 * The header is fixed except for two fields: a random serial and, in the last four bytes, the
 * CRC32 over the whole packet with those four bytes still zero.
 */
const DISCOVERY_PORT = 20002;
const HEADER_SIZE = 16;
/** the constant the adapter writes before it overwrites the field with the checksum */
const CRC_SEED = 1516993677;
const PROBE_TIMEOUT = 1200;

const CRC_TABLE = ((): number[] => {
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

let cachedQuery: Buffer | null = null;

/**
 * Build the discovery packet.
 *
 * Generating an RSA key costs far more than the probe itself, and the key plays no part in
 * the answer - it is only the handshake material the device would use later. One key per
 * scan is therefore built once and reused for every address.
 */
export function discoveryQuery(): Buffer {
    if (cachedQuery) {
        return cachedQuery;
    }

    const { publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const payload = Buffer.from(JSON.stringify({ params: { rsa_key: publicKey } }), 'utf8');

    const header = Buffer.alloc(HEADER_SIZE);
    header.writeUInt8(2, 0);
    header.writeUInt8(0, 1);
    header.writeUInt16BE(1, 2);
    header.writeUInt16BE(payload.length, 4);
    header.writeUInt8(33, 6);
    header.writeUInt8(0, 7);
    header.writeUInt32BE(Math.floor(Math.random() * 0xffffffff), 8);
    header.writeUInt32BE(CRC_SEED, 12);

    const packet = Buffer.concat([header, payload]);
    packet.writeUInt32BE(crc32(packet), 12);

    cachedQuery = packet;
    return packet;
}

export interface TapoDevice {
    model?: string;
    deviceType?: string;
    mac?: string;
}

/**
 * Read the answer: the same 16 byte header, then the JSON the device describes itself with.
 *
 * @param message the datagram
 */
export function parseTapoAnswer(message: Buffer): TapoDevice | null {
    if (message.length <= HEADER_SIZE) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(message.subarray(HEADER_SIZE).toString('utf8'));
    } catch {
        return null;
    }

    const result = answer?.result;
    if (!result || typeof result !== 'object') {
        return null;
    }
    // every Tapo and Kasa device names its type here, e.g. SMART.TAPOPLUG or SMART.TAPOBULB
    if (typeof result.device_type !== 'string' || !result.device_type) {
        return null;
    }

    return {
        model: typeof result.device_model === 'string' ? result.device_model : undefined,
        deviceType: result.device_type,
        mac: typeof result.mac === 'string' ? result.mac : undefined,
    };
}

/**
 * True for the device families this adapter drives - TP-Link answers the same way for its
 * Kasa line, which the tapo adapter does not handle.
 *
 * @param deviceType the `device_type` of the answer
 */
export function isTapoDevice(deviceType: string | undefined): boolean {
    return !!deviceType && /TAPO|SMART\.IPCAMERA/i.test(deviceType);
}

/**
 * The adapter logs into the TP-Link cloud; without those credentials it reaches none of the
 * devices found here. Asked once per proposal, and never on an instance that is already
 * configured - that one has its login.
 *
 * @param options the detection state of this scan
 */
function askForAccount(options: DetectOptions): void {
    const instance = tools.pendingProposal(options, adapterName);
    if (!instance || instance._existing) {
        return;
    }
    instance.comment ||= {};
    instance.comment.inputs ||= [
        { name: 'native.username', def: '', type: 'text', title: 'TP-Link account (e-mail)' },
        { name: 'native.password', def: '', type: 'password', title: 'TP-Link password' },
    ];
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const socket = dgram.createSocket('udp4');
    let done = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (found: boolean): void => {
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
        callback(null, found, ip);
    };

    timer = setTimeout((): void => finish(false), PROBE_TIMEOUT);

    socket.on('error', (): void => finish(false));

    socket.on('message', (message): void => {
        const answer = parseTapoAnswer(message);
        if (!answer || !isTapoDevice(answer.deviceType)) {
            return finish(false);
        }

        options.log.debug(`Tapo device detected at ${ip}: ${answer.model || answer.deviceType}`);
        // The adapter reaches every device through one TP-Link account and keeps no device
        // address in its configuration, so one instance covers all of them.
        const label = [answer.model || answer.deviceType, ip].join(' ');
        const added = tools.proposeSharedInstance(adapterName, label, options);
        askForAccount(options);
        finish(added);
    });

    const query = discoveryQuery();
    socket.send(query, 0, query.length, DISCOVERY_PORT, ip, (err): void => {
        if (err) {
            finish(false);
        }
    });
}

export const type = ['ip'];
// main.ts arms its watchdog with this before it calls detect(), so leave the probe room
export const timeout = PROBE_TIMEOUT + 300;
