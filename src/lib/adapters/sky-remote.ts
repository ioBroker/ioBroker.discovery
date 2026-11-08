import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'sky-remote';

/**
 * Sky Q and Sky+HD set-top boxes, over their remote-control port.
 *
 * The box speaks first: straight after the connect it sends the 12-byte greeting
 * `SKY 000.001\n`, before the client has sent anything. The probe only reads that greeting
 * and closes, so it presses no key and shows nothing on the TV. The box answers the same
 * way in standby. Seen identically from a Sky Q and from two Sky+HD boxes.
 */
const SKY_PORT = 49160;
const GREETING_LENGTH = 12;
const GREETING = /^SKY \d{3}\.\d{3}\n$/;
const PROBE_TIMEOUT = 1000;
// main.ts arms its watchdog with this before it calls detect(), so leave the probe room
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * Judge the bytes received so far: `true` is a Sky box, `false` is not, `null` wait for more.
 *
 * @param answer the bytes received so far
 */
export function judgeGreeting(answer: Buffer): boolean | null {
    if (answer.length < GREETING_LENGTH) {
        // reject early once the start no longer fits
        return 'SKY '.startsWith(answer.subarray(0, 4).toString('latin1')) ? null : false;
    }
    return GREETING.test(answer.subarray(0, GREETING_LENGTH).toString('latin1'));
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.debug(`sky-remote adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Sky box (${ip})`,
        },
        native: {
            host: ip,
            port: SKY_PORT,
        },
        comment: {
            add: [`Sky box (${ip})`],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let answer = Buffer.alloc(0);

    tools.testPort(
        ip,
        SKY_PORT,
        PROBE_TIMEOUT,
        {
            // the box speaks first - an empty handler keeps testPort waiting for the greeting
            onConnect: (): void => {},
            onReceive: (data): tools.PortReceiveResult => {
                answer = Buffer.concat([answer, data]);
                return judgeGreeting(answer);
            },
        },
        (err, found): void => {
            if (err || !found) {
                return callback(null, false, ip);
            }

            options.log.debug(`Sky box detected at ${ip}`);
            callback(null, addInstance(ip, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
