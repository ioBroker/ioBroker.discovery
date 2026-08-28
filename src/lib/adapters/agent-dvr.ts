import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'agent-dvr';

// The adapter builds http://<serverIp>:<port||8090> and asks /command/getStatus
const AGENT_PORT = 8090;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * Is this the status of an AgentDVR server?
 *
 * The adapter reads `profiles` out of the answer, so that key is what identifies the server.
 *
 * @param status the parsed body of /command/getStatus
 */
export function isAgentStatus(status: ProtocolData): boolean {
    return !!status && typeof status === 'object' && Array.isArray(status.profiles);
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.serverIp === ip);

    if (instance) {
        options.log.info(`AgentDVR adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `AgentDVR (${ip})`,
        },
        native: {
            serverIp: ip,
            port: AGENT_PORT,
        },
        comment: {
            add: ['AgentDVR', ip],
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

    tools.httpGet(`http://${ip}:${AGENT_PORT}/command/getStatus`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !data) {
            return finish(false);
        }

        let status: ProtocolData;
        try {
            status = JSON.parse(data);
        } catch {
            return finish(false);
        }

        if (!isAgentStatus(status)) {
            return finish(false);
        }

        options.log.debug(`AgentDVR detected at ${ip}`);
        finish(addInstance(ip, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
