import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'creality';

// Creality's K series runs Moonraker on the standard port; the adapter's own Moonraker
// client asks for /printer/info first, so that is the safest fingerprint.
const MOONRAKER_PORT = 7125;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** One printer per instance - the adapter keeps a single host in its configuration */
function addInstance(ip: string, info: ProtocolData, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`Creality adapter already present for ${ip}`);
        return false;
    }

    const name = typeof info.hostname === 'string' && info.hostname ? info.hostname : ip;

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Creality ${name} (${ip})`,
        },
        native: {
            host: ip,
            moonrakerPort: MOONRAKER_PORT,
        },
        comment: {
            add: [
                `${name}${info.software_version ? `, Klipper ${String(info.software_version).split('-')[0]}` : ''}`,
                ip,
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

    tools.httpGet(`http://${ip}:${MOONRAKER_PORT}/printer/info`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data) {
            return finish(false);
        }

        let answer: ProtocolData;
        try {
            answer = JSON.parse(data);
        } catch {
            return finish(false);
        }

        // Moonraker wraps everything in `result`; `software_version` is the Klipper build and
        // is present on every Moonraker, which is exactly what we want to recognise here.
        const info = answer?.result;
        if (!info || typeof info.software_version !== 'string') {
            return finish(false);
        }

        options.log.debug(`Creality printer detected at ${ip}`);
        finish(addInstance(ip, info, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
