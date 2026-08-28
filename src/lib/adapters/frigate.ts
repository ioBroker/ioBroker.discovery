import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'frigate';

/**
 * Frigate's own configuration endpoint. The adapter reads it to build its camera objects
 * (`lib/eventHistory.js`: `${frigateBaseUrl}/api/config`), and the default `friurl` of the
 * adapter is `localhost:5000` - the same port its bundled Docker setup publishes.
 *
 * Newer Frigate installations can require a login on port 8971; that instance answers 401
 * here and is not proposed. Anything behind a login has to be entered by hand anyway,
 * because the credentials cannot be guessed.
 */
const FRIGATE_PORT = 5000;
const PROBE_TIMEOUT = 1400;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

export interface FrigateConfig {
    cameras: string[];
    version?: string;
}

/**
 * Read `/api/config`.
 *
 * A Frigate config always carries a `cameras` map plus the sections Frigate is built around;
 * asking for a second one keeps an unrelated service that happens to answer `/api/config`
 * with something JSON-shaped from being taken for a Frigate.
 *
 * @param body the raw answer
 */
export function parseFrigateConfig(body: string | null): FrigateConfig | null {
    if (!body) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return null;
    }

    const cameras = answer?.cameras;
    if (!cameras || typeof cameras !== 'object' || Array.isArray(cameras)) {
        return null;
    }
    if (!answer.mqtt && !answer.detectors) {
        return null;
    }

    return {
        cameras: Object.keys(cameras),
        version: typeof answer.version === 'string' ? answer.version : undefined,
    };
}

function addInstance(ip: string, config: FrigateConfig, options: DetectOptions): boolean {
    const url = `${ip}:${FRIGATE_PORT}`;
    const instance = tools.findInstance(options, adapterName, obj => obj.native.friurl === url);

    if (instance) {
        options.log.info(`frigate adapter already present for ${url}`);
        return false;
    }

    const cameras = config.cameras.length ? ` with ${config.cameras.length} camera(s)` : '';

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Frigate (${ip})`,
        },
        native: {
            // the adapter takes host:port here and prefixes http:// itself
            friurl: url,
        },
        comment: {
            add: [`Frigate${config.version ? ` ${config.version}` : ''}${cameras} (${ip})`],
            // Frigate publishes its events over MQTT; without a broker the adapter sees no motion
            text: 'Check the MQTT settings - the adapter needs the broker Frigate publishes to',
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

    tools.httpGet(`http://${ip}:${FRIGATE_PORT}/api/config`, PROBE_TIMEOUT, (err, data): void => {
        if (err) {
            return finish(false);
        }

        const config = parseFrigateConfig(data);
        if (!config) {
            return finish(false);
        }

        options.log.debug(`Frigate detected at ${ip}`);
        finish(addInstance(ip, config, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
