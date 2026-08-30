import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'iiyama-prolite';

/**
 * iiyama ProLite displays, over the control protocol in the adapter's `lib/iiyama-protocol.js`.
 *
 * A command is `[0xA6, monitorId, 0x00, 0x00, 0x00, length, 0x01, code, ...data, checksum]`
 * with the checksum being the XOR over everything before it. `buildGetPowerCommand()` uses
 * code 25 (POWER_STATE_GET) - a read, and the gentlest thing the display understands.
 *
 * The answer is validated the way `parseResponse()` validates it: at least nine bytes and an
 * XOR over the whole frame that comes out at the last byte. That check is what identifies the
 * display; a frame of that shape does not appear by chance.
 */
const DISPLAY_PORT = 5000;
const HEADER = 0xa6;
/** the display answers with this header when it reports back */
const REPORT_HEADER = 0x21;
const DATA_CONTROL = 0x01;
const POWER_STATE_GET = 25;
/** the adapter's default, and the id a single display ships with */
const MONITOR_ID = 1;
const PROBE_TIMEOUT = 1400;
// main.ts arms its watchdog with this before it calls detect(), so leave the probe room
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * Build a command packet.
 *
 * @param monitorId id of the display, 1 unless a chain is set up
 * @param commandCode the command byte
 * @param data payload of the command
 */
export function buildCommand(monitorId: number, commandCode: number, data: number[] = []): Buffer {
    const packet = [HEADER, monitorId, 0x00, 0x00, 0x00, data.length + 3, DATA_CONTROL, commandCode, ...data];
    packet.push(packet.reduce((acc, byte) => acc ^ byte, 0));
    return Buffer.from(packet);
}

/** The "what is your power state" request */
export function powerStateRequest(): Buffer {
    return buildCommand(MONITOR_ID, POWER_STATE_GET);
}

/**
 * True if this is a well-formed answer of a ProLite display.
 *
 * @param answer the bytes received so far
 */
export function isDisplayAnswer(answer: Buffer): boolean {
    if (!answer || answer.length < 9) {
        return false;
    }
    if (answer[0] !== HEADER && answer[0] !== REPORT_HEADER) {
        return false;
    }
    let checksum = 0;
    for (let i = 0; i < answer.length - 1; i++) {
        checksum ^= answer[i];
    }
    return checksum === answer[answer.length - 1];
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`iiyama-prolite adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `iiyama ProLite (${ip})`,
        },
        native: {
            connectionType: 'tcp',
            host: ip,
            port: DISPLAY_PORT,
            monitorId: MONITOR_ID,
        },
        comment: {
            add: [`iiyama ProLite display (${ip})`],
            // a chain of displays shares the port and is told apart by the monitor id
            text: 'Check the monitor ID if several displays hang on one connection',
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let answer = Buffer.alloc(0);

    tools.testPort(
        ip,
        DISPLAY_PORT,
        PROBE_TIMEOUT,
        {
            onConnect: (_ip, _port, client): void => {
                client.write(powerStateRequest());
            },
            onReceive: (data): tools.PortReceiveResult => {
                answer = Buffer.concat([answer, data]);
                if (answer.length < 9) {
                    return null; // frame still arriving
                }
                return isDisplayAnswer(answer);
            },
        },
        (err, found): void => {
            if (err || !found) {
                return callback(null, false, ip);
            }

            options.log.debug(`iiyama ProLite detected at ${ip}`);
            callback(null, addInstance(ip, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
