import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'evcc';

// The adapter reads http://<ip>:<port>/api/state; 7070 is the default in its io-package
const EVCC_PORT = 7070;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * Pick the evcc state out of an /api/state answer. Returns null when this is not an evcc.
 *
 * Depending on the version the state sits at the top level or under `result`. `loadpoints`
 * is the charging point list and is what makes this an evcc rather than any other service
 * answering JSON on this port.
 *
 * @param answer the parsed body of /api/state
 */
export function evccState(answer: ProtocolData): ProtocolData {
    const state = answer?.result && typeof answer.result === 'object' ? answer.result : answer;
    return state && Array.isArray(state.loadpoints) ? state : null;
}

function addInstance(ip: string, state: ProtocolData, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.ip === ip);

    if (instance) {
        options.log.info(`evcc adapter already present for ${ip}`);
        return false;
    }

    const title = typeof state.siteTitle === 'string' && state.siteTitle ? state.siteTitle : ip;

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `evcc ${title} (${ip})`,
        },
        native: {
            ip,
            // the adapter stores the port as text
            port: String(EVCC_PORT),
        },
        comment: {
            add: [`evcc ${title}`, ip],
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

    tools.httpGet(`http://${ip}:${EVCC_PORT}/api/state`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data) {
            return finish(false);
        }

        let answer: ProtocolData;
        try {
            answer = JSON.parse(data);
        } catch {
            return finish(false);
        }

        const state = evccState(answer);
        if (!state) {
            return finish(false);
        }

        options.log.debug(`evcc detected at ${ip}`);
        finish(addInstance(ip, state, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
