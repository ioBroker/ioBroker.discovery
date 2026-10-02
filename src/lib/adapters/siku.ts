import dgram from 'node:dgram';
import { isIPv4 } from 'node:net';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const PORT = 4000;
const PROBE_TIMEOUT = 1500;
const MAX_DEVICES = 64;
const DEVICE_ID = /^[0-9A-F]{16}$/;

export interface SikuDevice {
    id: string;
    host: string;
    /** `''` when the fan did not answer parameter 0xb9 - the adapter treats it as optional too */
    discoveredType: string;
}

/**
 * RV V2 read-only discovery used by ioBroker.siku (SIKU and compatible Oxxify Smart fans).
 * Protocol reference: https://github.com/ChrMaass/ioBroker.siku/blob/main/src/lib/siku-protocol.ts.
 * No write, mode, clock or setup command is sent. Only the factory PIN 1111 is tried.
 */
export function discoveryRequest(): Buffer {
    return Buffer.from('fdfd021044454641554c545f44455649434549440431313131017cb9b106', 'hex');
}

/** The device type is a little-endian unsigned of whatever width the firmware answers with. */
function readUnsignedLE(value: Buffer): number {
    let result = 0;
    for (let i = value.length - 1; i >= 0; i--) {
        result = result * 256 + value[i];
    }
    return result;
}

/** Validate the complete binary envelope before interpreting any parameter data. */
export function parseResponse(message: Buffer, host: string): SikuDevice | null {
    if (
        !isIPv4(host) ||
        message.length < 24 ||
        message[0] !== 0xfd ||
        message[1] !== 0xfd ||
        message[2] !== 2 ||
        message[3] !== 16
    ) {
        return null;
    }
    const end = message.length - 2;
    let sum = 0;
    for (let i = 2; i < end; i++) {
        sum = (sum + message[i]) & 0xffff;
    }
    if (sum !== message.readUInt16LE(end)) {
        return null;
    }
    const headerId = message.subarray(4, 20).toString('latin1').toUpperCase();
    const passwordSize = message[20];
    let position = 21 + passwordSize;
    if (!DEVICE_ID.test(headerId) || passwordSize > 8 || position >= end || message[position++] !== 6) {
        return null;
    }

    let page = 0;
    const parameters = new Map<number, Buffer>();
    while (position < end) {
        const marker = message[position++];
        if (marker === 0xff || marker === 0xfc || marker === 0xfd) {
            if (position >= end) {
                return null;
            }
            const value = message[position++];
            if (marker === 0xff) {
                page = value;
            } else if (marker === 0xfc && value !== 6) {
                return null; // do not mistake write/read data for an answer
            }
            // 0xfd says the fan does not support that parameter. Skip the entry, the way the
            // adapter does with its `!entry.unsupported` filter - neither of the two parameters
            // is required below.
            continue;
        }
        let size = 1;
        let parameter = marker;
        if (marker === 0xfe) {
            if (position + 2 > end) {
                return null;
            }
            size = message[position++];
            parameter = message[position++];
        }
        if (!size || position + size > end) {
            return null;
        }
        parameter |= page << 8;
        if (parameters.has(parameter)) {
            return null;
        }
        parameters.set(parameter, message.subarray(position, position + size));
        position += size;
    }

    // The envelope is the fingerprint, and it is a long one: 0xfdfd, protocol type 2, an ID
    // length field of exactly 16, a checksum over the whole frame, function code 6 and a data
    // block that parses as RV V2 to exactly the frame end. Nothing else on the network produces
    // that by accident.
    //
    // The two parameters are asked for but not demanded, because the adapter that is being
    // proposed does not demand them either: in `readDiscoveryAnswer()` the ID falls back to the
    // frame header and the device type may stay `null`. A firmware that answers only one of them
    // is still a fan worth proposing - insisting on both would hide it from the one adapter that
    // can talk to it.
    const payloadId = parameters.get(0x7c);
    const id = payloadId?.length === 16 ? payloadId.toString('latin1').toUpperCase() : headerId;
    if (!DEVICE_ID.test(id)) {
        return null;
    }
    const model = parameters.get(0xb9);
    return {
        id,
        host,
        discoveredType: model?.length ? `${model.toString('hex').toUpperCase()} (${readUnsignedLE(model)})` : '',
    };
}

function propose(devices: Map<string, SikuDevice>, options: DetectOptions): boolean {
    if (!devices.size) {
        return false;
    }
    const rows = [...devices.values()].sort((a, b) => a.id.localeCompare(b.id));
    options.newInstances.push({
        _id: tools.getNextInstanceID('siku', options),
        common: { name: 'siku', title: 'SIKU / Oxxify Smart' },
        native: {
            // Mirror siku's defaults so the proposal is also valid before admin merges metadata.
            pollIntervalSec: 30,
            discoveryBroadcastAddress: '255.255.255.255',
            timeCheckIntervalHours: 24,
            timeSyncThresholdSec: 10,
            devices: rows.map(row => ({
                ...row,
                name: `SIKU / Oxxify ${row.id.slice(-4)}`,
                enabled: true,
                // Left to the adapter on purpose: a proposal can sit unacknowledged for days,
                // and the scan time would then read as a contact that never happened.
                lastSeen: '',
            })),
            // The adapter resolves an absent per-device credential to factory PIN 1111.
            // Do not embed passwords into native.devices or discovery metadata.
            devicePasswords: [],
        },
        comment: { add: rows.map(row => `${row.id} (${row.host})`) },
    });
    return true;
}

export function detect(ip: string, _device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // One instance already manages every fan. Leave its names, disabled rows and encrypted
    // credentials untouched; its own admin discovery can add additional devices.
    // The object ID carries the adapter name, so this covers an instance that already exists and
    // one another module proposed earlier in this scan alike - which is what
    // `tools.findInstance()` would look up through `common.name`: the same name by a longer road.
    const hasSiku = [...options.existingInstances, ...options.newInstances].some(instance =>
        /^system\.adapter\.siku\.\d+$/.test(instance._id),
    );
    if (hasSiku) {
        callback(null, false, ip);
        return;
    }

    const devices = new Map<string, SikuDevice>();
    let socket: dgram.Socket | null = null;
    let finished = false;
    let timer: NodeJS.Timeout | null = null;

    const closeSocket = (): void => {
        if (!socket) {
            return;
        }
        const dead = socket;
        socket = null;
        dead.removeAllListeners();
        dead.on('error', () => undefined); // a pending send may fail after close
        try {
            dead.close();
        } catch {
            // A failed bind may already have closed the socket.
        }
    };

    const finish = (success: boolean): void => {
        if (finished) {
            return;
        }
        finished = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        closeSocket();
        callback(null, success && propose(devices, options), ip);
    };
    timer = setTimeout(() => finish(true), PROBE_TIMEOUT);
    const fail = (error: Error): void => {
        options.log.debug(`SIKU discovery on UDP ${PORT} skipped: ${error.message}`);
        finish(false);
    };

    // Do not reuse the shared text udpScan helper: UTF-8 conversion corrupts binary frames.
    //
    // `reuseAddr` stays off: on Windows SO_REUSEADDR lets a second bind take the datagrams of the
    // first, and no application is going to lose its UDP replies to a discovery scan. So a taken
    // port 4000 really does fail here - and is then asked from a free port instead, because the
    // fans answer whichever port the request came from. The adapter does the same thing in
    // `bindSocketWithFallback()`, which tries [PORT, 0].
    const ask = (port: number): void => {
        closeSocket();
        if (finished) {
            return;
        }
        const own = dgram.createSocket({ type: 'udp4', reuseAddr: false });
        socket = own;
        own.on('error', (error: Error): void => {
            if (port === PORT) {
                options.log.debug(`SIKU discovery: UDP ${PORT} is taken (${error.message}), asking from a free port`);
                ask(0);
            } else {
                fail(error);
            }
        });
        own.on('message', (message, remote) => {
            if (finished || devices.size >= MAX_DEVICES) {
                return;
            }
            const entry = parseResponse(message, remote.address);
            if (entry && !devices.has(entry.id)) {
                devices.set(entry.id, entry);
            }
        });
        own.on('listening', () => {
            try {
                own.setBroadcast(true);
                own.send(discoveryRequest(), PORT, ip, error => {
                    if (error) {
                        fail(error);
                    }
                });
            } catch (error) {
                // Not an address conflict, so this one does not get a second port.
                fail(error instanceof Error ? error : new Error(String(error)));
            }
        });
        try {
            own.bind(port);
        } catch (error) {
            // A synchronous bind failure must cancel the scan, not leak a later callback into the
            // core - and it has earned the free port just as much as an asynchronous one.
            own.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
    };
    ask(PORT);
}

// The existing UDP method supplies one broadcast address, not one probe per ping result.
export const type = ['udp'];
// The core starts its watchdog before detect(); leave room for the socket timer to finish.
export const timeout = PROBE_TIMEOUT + 500;
