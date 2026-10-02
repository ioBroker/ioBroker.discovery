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
            } else if (marker === 0xfd && page === 0 && (value === 0x7c || value === 0xb9)) {
                return null; // both identifying parameters must be supported
            }
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

    const id = parameters.get(0x7c);
    const model = parameters.get(0xb9);
    // Requiring both parameters and matching IDs avoids recommendations for unrelated UDP services.
    if (!id || id.length !== 16 || id.toString('latin1').toUpperCase() !== headerId || model?.length !== 2) {
        return null;
    }
    return { id: headerId, host, discoveredType: `${model.toString('hex').toUpperCase()} (${model.readUInt16LE(0)})` };
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
                lastSeen: new Date().toISOString(),
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
    // This also avoids competing with an installed adapter for the fixed reply port.
    // common.name is a display label and may have been changed; the object ID is stable.
    const hasSikuId = [...options.existingInstances, ...options.newInstances].some(instance =>
        /^system\.adapter\.siku\.\d+$/.test(instance._id),
    );
    if (hasSikuId || tools.findInstance(options, 'siku')) {
        callback(null, false, ip);
        return;
    }

    // Do not reuse the shared text udpScan helper: UTF-8 conversion corrupts binary frames.
    // Do not reuse port 4000 either: another application must not lose its UDP replies.
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: false });
    const devices = new Map<string, SikuDevice>();
    let finished = false;
    let timer: NodeJS.Timeout | null = null;
    const finish = (success: boolean): void => {
        if (finished) {
            return;
        }
        finished = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        socket.removeAllListeners();
        socket.on('error', () => undefined); // a pending send may fail after close
        try {
            socket.close();
        } catch {
            // A failed bind may already have closed the socket.
        }
        callback(null, success && propose(devices, options), ip);
    };
    timer = setTimeout(() => finish(true), PROBE_TIMEOUT);
    const fail = (error: Error): void => {
        options.log.debug(`SIKU discovery on UDP ${PORT} skipped: ${error.message}`);
        finish(false);
    };
    socket.on('error', fail);
    socket.on('message', (message, remote) => {
        if (finished || devices.size >= MAX_DEVICES) {
            return;
        }
        const entry = parseResponse(message, remote.address);
        if (entry && !devices.has(entry.id)) {
            devices.set(entry.id, entry);
        }
    });
    socket.on('listening', () => {
        try {
            socket.setBroadcast(true);
            socket.send(discoveryRequest(), PORT, ip, error => {
                if (error) {
                    fail(error);
                }
            });
        } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
        }
    });
    try {
        socket.bind(PORT);
    } catch (error) {
        // A synchronous bind failure must cancel the scan, not leak a later callback into the core.
        fail(error instanceof Error ? error : new Error(String(error)));
    }
}

// The existing UDP method supplies one broadcast address, not one probe per ping result.
export const type = ['udp'];
// The core starts its watchdog before detect(); leave room for the socket timer to finish.
export const timeout = PROBE_TIMEOUT + 500;
