import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'janitza-gridvis';

// The adapter reads /rest/common/info/version/full.json and takes `value` from it. That
// endpoint needs no project and no credentials, which makes it the right probe.
const GRIDVIS_PORT = 8080;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** The version endpoint answers a JSON object carrying `value` */
export function gridvisVersion(body: string | null): string | undefined {
    if (!body) {
        return undefined;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return undefined;
    }
    if (!answer || typeof answer !== 'object' || typeof answer.value !== 'string') {
        return undefined;
    }
    return answer.value;
}

function addInstance(ip: string, version: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.address === ip);

    if (instance) {
        options.log.info(`GridVis adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Janitza GridVis (${ip})`,
        },
        native: {
            address: ip,
            port: GRIDVIS_PORT,
        },
        comment: {
            add: [`GridVis ${version}`, ip],
            // Without a project name the adapter cannot read any measurement
            inputs: [{ name: 'native.projectname', def: '', type: 'text', title: 'GridVis project name' }],
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

    tools.httpGet(
        `http://${ip}:${GRIDVIS_PORT}/rest/common/info/version/full.json`,
        PROBE_TIMEOUT,
        (err, data): void => {
            if (err) {
                return finish(false);
            }
            const version = gridvisVersion(data);
            if (!version) {
                return finish(false);
            }

            options.log.debug(`Janitza GridVis ${version} detected at ${ip}`);
            finish(addInstance(ip, version, options));
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
