import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'volumio';

// The adapter's REST client talks to /api/v1/... on the standard Volumio web port
const VOLUMIO_PORT = 3000;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** Volumio keeps one host per instance, so every player gets its own proposal */
function addInstance(ip: string, info: ProtocolData, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`Volumio adapter already present for ${ip}`);
        return false;
    }

    const name = typeof info.name === 'string' && info.name ? info.name : ip;

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Volumio ${name} (${ip})`,
        },
        native: {
            host: ip,
        },
        comment: {
            add: [`${name}${info.systemversion ? `, Volumio ${info.systemversion}` : ''}`, ip],
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

    tools.httpGet(`http://${ip}:${VOLUMIO_PORT}/api/v1/getSystemInfo`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data) {
            return finish(false);
        }

        let info: ProtocolData;
        try {
            info = JSON.parse(data);
        } catch {
            return finish(false);
        }

        // A Volumio player answers with its system description; `systemversion` and `hardware`
        // are what tells it apart from any other service that happens to sit on port 3000.
        if (!info || typeof info.systemversion !== 'string' || typeof info.hardware !== 'string') {
            return finish(false);
        }

        options.log.debug(`Volumio detected at ${ip}`);
        finish(addInstance(ip, info, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
