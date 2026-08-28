/**
 * Bambu Lab 3D printers announce themselves with an SSDP NOTIFY, but not where a UPnP
 * control point listens for it.
 *
 * The announcement carries `NT: urn:bambulab-com:device:3dprinter:1` - the same service
 * type the Home Assistant integration registers for (`ha-bambulab`, manifest.json:
 * `"ssdp": [{ "st": "urn:bambulab-com:device:3dprinter:1" }]`) - and repeats it every few
 * seconds. What makes it awkward is the destination: besides the usual 239.255.255.250:1900
 * the printers send the very same datagram to port 1990 and to port 2021, and they answer
 * no M-SEARCH at all. Bambu Studio listens on 2021, which is why every workaround script
 * around the slicer sends there too.
 *
 * Sources disagree on whether 1900 is really used by all firmware versions, so this method
 * takes the two ports the UPnP method cannot see (1990 multicast and 2021, which the printer
 * also broadcasts to) and leaves 1900 to `methods/upnp.ts`. `adapters/bambulab.ts` accepts
 * a find from either side.
 */

import * as dgram from 'node:dgram';
import type { RemoteInfo, Socket } from 'node:dgram';
import * as tools from '../tools';
import type { MethodInstance, ProtocolData } from '../types';

const methodName = 'bambulab';
const SSDP_MULTICAST = '239.255.255.250';
/** Bambu Studio listens here; the printer broadcasts to it */
const STUDIO_PORT = 2021;
/** The second, multicast-only channel of the same announcement */
const NOTIFY_PORT = 1990;
const SERVICE_TYPE = 'urn:bambulab-com:device:3dprinter:1';
/** The printer repeats itself every few seconds - two chances are enough */
const DURATION = 12000;

/**
 * Split an SSDP datagram into its header lines.
 *
 * Both shapes occur: `NOTIFY * HTTP/1.1` from the printer itself and `HTTP/1.1 200 OK` from
 * the helper scripts people run to make a printer discoverable across subnets.
 *
 * @param raw the datagram as it came off the wire
 */
export function parseSsdp(raw: string): Record<string, string> | null {
    const lines = raw.split(/\r?\n/);
    const start = lines.shift();
    if (!start || !/HTTP\/1\.\d/i.test(start)) {
        return null;
    }

    const headers: Record<string, string> = {};
    for (const line of lines) {
        const at = line.indexOf(':');
        if (at > 0) {
            headers[line.slice(0, at).trim().toUpperCase()] = line.slice(at + 1).trim();
        }
    }
    return headers;
}

/**
 * True if these headers announce a Bambu Lab printer.
 *
 * A NOTIFY names the service type in `NT`, an answer in `ST`.
 *
 * @param headers the parsed header lines
 */
export function isBambuAnnouncement(headers: Record<string, string> | null): boolean {
    if (!headers) {
        return false;
    }
    return [headers.NT, headers.ST].some(value => typeof value === 'string' && value.includes(SERVICE_TYPE));
}

function listen(
    self: MethodInstance,
    port: number,
    join: boolean,
    onMessage: (raw: string, from: RemoteInfo) => void,
): Socket {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', (e): void => {
        self.adapter.log.debug(`Cannot listen for Bambu Lab announcements on ${port}: ${e.message}`);
        try {
            socket.close();
        } catch {
            // already gone
        }
    });

    socket.on('message', (message, from): void => onMessage(message.toString('utf8'), from));

    socket.bind(port, (): void => {
        try {
            socket.setBroadcast(true);
        } catch {
            // not fatal, the multicast channel may still deliver
        }
        if (!join) {
            return;
        }
        for (const dev of tools.getIP4addresses()) {
            try {
                socket.addMembership(SSDP_MULTICAST, dev.ip);
            } catch {
                // an interface that refuses the group is not worth aborting the whole scan for
            }
        }
    });

    return socket;
}

function discover(self: MethodInstance): void {
    // same shape as methods/upnp.ts: the configured duration wins, the constant is the default
    self.timeout = ~~self.timeout || DURATION;
    self.adapter.log.info('Discovering Bambu Lab printers...');

    const sockets: Socket[] = [];
    const seen = new Set<string>();

    const onMessage = (raw: string, from: RemoteInfo): void => {
        const headers = parseSsdp(raw);
        if (!isBambuAnnouncement(headers) || seen.has(from.address)) {
            return;
        }
        seen.add(from.address);

        const info: ProtocolData = headers;
        self.adapter.log.debug(`Bambu Lab announcement from ${from.address}: ${JSON.stringify(info)}`);

        self.addDevice({
            // `Location` carries the bare IP without a scheme, so the sender is the safer source
            _addr: from.address,
            _name: info['DEVNAME.BAMBU.COM'] || 'Bambu Lab printer',
            _bambulab: info,
        });
    };

    self.close = (): void => {
        for (const socket of sockets) {
            try {
                socket.close();
            } catch {
                // never bound, or closed by its own error handler
            }
        }
        sockets.length = 0;
    };

    sockets.push(listen(self, STUDIO_PORT, true, onMessage));
    sockets.push(listen(self, NOTIFY_PORT, true, onMessage));

    self.setTimeout(self.timeout);
}

export const browse = discover;
export const type = 'bambulab';
export const source = methodName;
export const timeout = DURATION;
