import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'luxtronik2-controller';

/**
 * The Luxtronik heat pump controller (Alpha Innotec, Novelan, Wolf and the rest of the
 * family), over the raw TCP protocol its `lib/rawFunctions.js` speaks.
 *
 * A request is nothing but big-endian 32 bit words - `client.write(createCommandBuffer(command, 0))`.
 * `CMD_READ_VALUE = 3004` asks for the measurement list, so the probe reads and never writes;
 * the write command is 3002 and is not used here.
 *
 * The answer opens with the command echoed back, and for 3004 the item count sits at offset
 * 8 - both checks come straight out of the adapter's `parseRawResponse()`, including its
 * sanity bound of ten thousand items.
 */
const PORTS = [8889, 8888];
const CMD_READ_VALUE = 3004;
const MAX_ITEMS = 10000;
const PROBE_TIMEOUT = 1200;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than both port attempts together
const DETECT_TIMEOUT = PORTS.length * PROBE_TIMEOUT + 300;

/** The eight byte request: the command, then the zero the protocol expects behind it */
export function readValuesRequest(): Buffer {
    const request = Buffer.alloc(8);
    request.writeInt32BE(CMD_READ_VALUE, 0);
    request.writeInt32BE(0, 4);
    return request;
}

/**
 * How many measurements the controller announced, or `null` if this is not one of its
 * answers.
 *
 * @param answer the bytes received so far
 */
export function parseValueHeader(answer: Buffer): number | null {
    // command (4) + status (4) + item count (4)
    if (!answer || answer.length < 12) {
        return null;
    }
    if (answer.readInt32BE(0) !== CMD_READ_VALUE) {
        return null;
    }
    const items = answer.readInt32BE(8);
    if (items <= 0 || items > MAX_ITEMS) {
        return null;
    }
    return items;
}

function addInstance(ip: string, port: number, items: number, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`luxtronik2-controller adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Luxtronik heat pump (${ip})`,
        },
        native: {
            host: ip,
            port,
        },
        comment: {
            add: [`Luxtronik controller with ${items} measurements (${ip}:${port})`],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const probe = (ports: number[]): void => {
        const port = ports.shift();
        if (port === undefined) {
            return callback(null, false, ip);
        }

        let answer = Buffer.alloc(0);
        let items: number | null = null;

        tools.testPort(
            ip,
            port,
            PROBE_TIMEOUT,
            {
                onConnect: (_ip, _port, client): void => {
                    client.write(readValuesRequest());
                },
                onReceive: (data): tools.PortReceiveResult => {
                    answer = Buffer.concat([answer, data]);
                    if (answer.length < 12) {
                        return null; // header still arriving
                    }
                    items = parseValueHeader(answer);
                    return items !== null;
                },
            },
            (err, found): void => {
                if (err || !found || items === null) {
                    return probe(ports);
                }

                options.log.debug(`Luxtronik controller detected at ${ip}:${port}`);
                callback(null, addInstance(ip, port, items, options), ip);
            },
        );
    };

    probe([...PORTS]);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
