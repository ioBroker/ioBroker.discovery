import * as dgram from 'node:dgram';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'govee-smart';

/**
 * Govee's LAN API, taken from the adapter's own `lib/govee-lan-client.js`: a scan goes out as
 * multicast to 239.255.255.250:4001, the answers come back to the fixed port 4002 - not to the
 * sending socket. That is why the listener below has to own 4002 while it asks.
 */
const MULTICAST_ADDR = '239.255.255.250';
const SCAN_PORT = 4001;
const LISTEN_PORT = 4002;
const SCAN_MESSAGE = JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } });
const LISTEN_TIMEOUT = 2500;

export interface GoveeDevice {
    ip: string;
    device: string;
    sku: string;
}

/**
 * Read a scan answer.
 *
 * The checks mirror the adapter's `handleScanResponse()`, including the reason it ignores the
 * `ip` field of the payload: the authentic address is the sender of the datagram, a payload
 * field can be claimed by anyone.
 *
 * @param raw the datagram
 * @param sourceIp address the datagram came from
 */
export function parseGoveeScan(raw: string, sourceIp: string): GoveeDevice | null {
    let answer: ProtocolData;
    try {
        answer = JSON.parse(raw);
    } catch {
        return null;
    }

    if (answer?.msg?.cmd !== 'scan') {
        return null;
    }
    const data = answer.msg.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return null;
    }
    if (typeof data.device !== 'string' || typeof data.sku !== 'string' || !data.device || !data.sku) {
        return null;
    }
    if (data.device.length > 64 || data.sku.length > 24) {
        return null;
    }

    return { ip: sourceIp, device: data.device, sku: data.sku };
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    const listener = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const scanner = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const seen = new Map<string, GoveeDevice>();
    let found = false;

    const finish = (): void => {
        if (!callback) {
            return;
        }
        const report = callback;
        callback = null;

        for (const entry of seen.values()) {
            // The adapter drives every lamp through one account, so all finds land in one proposal
            if (tools.proposeSharedInstance(adapterName, `Govee ${entry.sku} (${entry.ip})`, options)) {
                found = true;
            }
        }

        // The LAN API answers without any credential, but the adapter needs the Govee API key
        // to do anything with the lamps. Asked once, and not on an instance that already has one.
        const instance = tools.pendingProposal(options, adapterName);
        if (instance && !instance._existing) {
            instance.comment ||= {};
            instance.comment.inputs ||= [{ name: 'native.apiKey', def: '', type: 'password', title: 'Govee API key' }];
        }

        for (const socket of [listener, scanner]) {
            try {
                socket.close();
            } catch {
                // never bound, or already closed by its error handler
            }
        }
        report(null, found, ip);
    };

    const onError =
        (what: string) =>
        (e: Error): void => {
            options.log.debug(`govee-smart: ${what} socket failed: ${e.message}`);
            finish();
        };

    listener.on('error', onError('listen'));
    scanner.on('error', onError('scan'));

    listener.on('message', (message, remote): void => {
        const entry = parseGoveeScan(message.toString('utf8'), remote.address);
        if (entry) {
            options.log.debug(`Govee ${entry.sku} detected at ${entry.ip}`);
            seen.set(`${entry.device}:${entry.ip}`, entry);
        }
    });

    listener.bind(LISTEN_PORT, (): void => {
        scanner.bind(0, (): void => {
            try {
                scanner.setBroadcast(true);
                for (const dev of tools.getIP4addresses()) {
                    try {
                        scanner.addMembership(MULTICAST_ADDR, dev.ip);
                    } catch {
                        // an interface that refuses the group must not abort the scan
                    }
                }
            } catch {
                // keep asking anyway, the multicast may still leave through the default route
            }
            const packet = Buffer.from(SCAN_MESSAGE);
            scanner.send(packet, 0, packet.length, SCAN_PORT, MULTICAST_ADDR, (): void => {});
        });
    });

    setTimeout(finish, LISTEN_TIMEOUT);
}

// one multicast question reaches every lamp at once, so this runs once and not per address
export const type = ['once'];
// main.ts arms its watchdog with this before it calls detect(), so leave the listener room
export const timeout = LISTEN_TIMEOUT + 300;
