import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'viessmann';

/**
 * Not the boiler, but vcontrold - the daemon that sits on the Optolink cable and hands the
 * Viessmann heating out over TCP. That is what the adapter talks to: it connects to port 3002
 * and drives a line protocol, and its own data handler tests the answer against `/vctrld>/`.
 *
 * That prompt is the whole probe. vcontrold greets a fresh connection with it, so nothing has
 * to be written and no command reaches the heating.
 */
const VCONTROLD_PORT = 3002;
const PROMPT = /vctrld>/;
const PROBE_TIMEOUT = 1400;
// main.ts arms its watchdog with this before it calls detect(), so leave the probe room
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * True if this greeting comes from a vcontrold.
 *
 * @param banner what the daemon sent after the connection opened
 */
export function isVcontroldPrompt(banner: string): boolean {
    return !!banner && PROMPT.test(banner);
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.ip === ip);

    if (instance) {
        options.log.info(`viessmann adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Viessmann via vcontrold (${ip})`,
        },
        native: {
            ip,
            // the adapter keeps the port as text
            port: String(VCONTROLD_PORT),
        },
        comment: {
            add: [`vcontrold on ${ip}:${VCONTROLD_PORT}`],
            // the datapoint list is generated from the daemon's own configuration file
            inputs: [
                {
                    name: 'native.path',
                    def: '/etc/vcontrold',
                    type: 'text',
                    title: 'Directory of vcontrold.xml on that host',
                },
                { name: 'native.user_name', def: '', type: 'text', title: 'SSH user (to read vcontrold.xml)' },
                { name: 'native.password', def: '', type: 'password', title: 'SSH password' },
            ],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let banner = '';

    tools.testPort(
        ip,
        VCONTROLD_PORT,
        PROBE_TIMEOUT,
        {
            onConnect: (): void => {
                // Nothing is sent - vcontrold prompts on its own. The handler still has to be
                // here: tools.testPort() takes a missing onConnect to mean "the port is open,
                // so we are done" and would report every open 3002 as a vcontrold.
            },
            onReceive: (data): tools.PortReceiveResult => {
                banner += data.toString('utf8');
                if (isVcontroldPrompt(banner)) {
                    return true;
                }
                // the prompt is short; anything longer is some other service on this port
                return banner.length > 256 ? false : null;
            },
        },
        (err, found): void => {
            if (err || !found || !isVcontroldPrompt(banner)) {
                return callback(null, false, ip);
            }

            options.log.debug(`vcontrold detected at ${ip}`);
            callback(null, addInstance(ip, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
