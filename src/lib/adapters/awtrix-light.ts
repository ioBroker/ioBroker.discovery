import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'awtrix-light';

// The adapter's api.js asks for `stats` under /api/ on the standard web port
const AWTRIX_PORT = 80;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

// /api/stats reports the state of the matrix clock. Rather than pin one key, several of the
// known ones have to be present - that survives a firmware that renames a single field while
// still ruling out any other service answering JSON on port 80.
const STATS_KEYS = ['bat', 'lux', 'ram', 'uptime', 'wifi_signal', 'version', 'app', 'matrix'];
const MIN_KEYS = 4;

/**
 * Does this /api/stats answer come from a matrix clock?
 *
 * @param stats the parsed body of /api/stats
 */
export function isAwtrixStats(stats: ProtocolData): boolean {
    if (!stats || typeof stats !== 'object') {
        return false;
    }
    return STATS_KEYS.filter(key => stats[key] !== undefined).length >= MIN_KEYS;
}

function addInstance(ip: string, stats: ProtocolData, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.awtrixIp === ip);

    if (instance) {
        options.log.info(`Awtrix adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Awtrix (${ip})`,
        },
        native: {
            awtrixIp: ip,
        },
        comment: {
            add: [`Awtrix${stats.version ? ` ${String(stats.version)}` : ''}`, ip],
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

    tools.httpGet(`http://${ip}:${AWTRIX_PORT}/api/stats`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data) {
            return finish(false);
        }

        let stats: ProtocolData;
        try {
            stats = JSON.parse(data);
        } catch {
            return finish(false);
        }

        if (!isAwtrixStats(stats)) {
            return finish(false);
        }

        options.log.debug(`Awtrix detected at ${ip}`);
        finish(addInstance(ip, stats, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
