import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'enigma2';

// The adapter uses /web/about as its own reachability check (PATH.IP_CHECK)
const ENIGMA2_PORT = 80;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** The OpenWebif answer is XML wrapped in <e2abouts> */
export function isEnigma2About(body: string): boolean {
    return /<e2abouts?[\s>]/i.test(body);
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.IPAddress === ip);

    if (instance) {
        options.log.info(`enigma2 adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Enigma2 receiver (${ip})`,
        },
        native: {
            // the adapter spells these with capitals and keeps the port as text
            IPAddress: ip,
            Port: String(ENIGMA2_PORT),
        },
        comment: {
            add: ['Enigma2 / OpenWebif', ip],
            // OpenWebif is usually protected; without credentials the adapter reads nothing
            inputs: [
                { name: 'native.Username', def: 'root', type: 'text', title: 'User name' },
                { name: 'native.Password', def: '', type: 'password', title: 'Password' },
            ],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let done = false;
    // tools.httpGet reports twice when a non-200 answer carries a body - see its comment
    const finish = (found: boolean): void => {
        if (!done) {
            done = true;
            callback(null, found, ip);
        }
    };

    tools.httpGet(`http://${ip}:${ENIGMA2_PORT}/web/about`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data || !isEnigma2About(data)) {
            return finish(false);
        }

        options.log.debug(`Enigma2 receiver detected at ${ip}`);
        finish(addInstance(ip, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
