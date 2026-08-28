import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'autodarts';

// The adapter's fetchState() asks the local Board Manager for /api/state and reads
// `status`, `event` and `throws` out of the answer.
const AUTODARTS_PORT = 3180;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** The board state carries a status plus at least one of the fields the adapter reads */
export function isBoardState(state: ProtocolData): boolean {
    if (!state || typeof state !== 'object' || typeof state.status !== 'string') {
        return false;
    }
    return state.throws !== undefined || state.event !== undefined;
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`Autodarts adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Autodarts Board Manager (${ip})`,
        },
        native: {
            host: ip,
            port: AUTODARTS_PORT,
        },
        comment: {
            add: ['Autodarts Board Manager', ip],
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

    tools.httpGet(`http://${ip}:${AUTODARTS_PORT}/api/state`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data) {
            return finish(false);
        }

        let state: ProtocolData;
        try {
            state = JSON.parse(data);
        } catch {
            return finish(false);
        }
        if (!isBoardState(state)) {
            return finish(false);
        }

        options.log.debug(`Autodarts Board Manager detected at ${ip}`);
        finish(addInstance(ip, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
