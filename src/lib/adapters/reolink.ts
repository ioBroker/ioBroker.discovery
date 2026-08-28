import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'reolink';

// The adapter builds `<protocol>://<ip>/api.cgi?cmd=<command>&user=…&password=…` (genUrl)
// and evaluates `error.rspCode` / `error.detail` from the answer. Without credentials the
// camera answers the same array shape with an error entry - which is proof enough.
//
// Note the path: /api.cgi, not /cgi-bin/api.cgi.
const PROBE_COMMAND = 'GetDevInfo';
const PROBE_TIMEOUT = 1400;
// Two protocols are tried one after the other, so the watchdog needs room for both.
const DETECT_TIMEOUT = 2 * PROBE_TIMEOUT + 300;

export interface ReolinkAnswer {
    /** the camera answered, but wants credentials first */
    needsAuth: boolean;
    model?: string;
    name?: string;
}

/**
 * Read the answer of `/api.cgi?cmd=GetDevInfo`.
 *
 * Reolink answers an array of command results - that shape, with the command echoed back,
 * is what identifies the camera whether or not the call was authenticated.
 *
 * @param body the raw answer
 */
export function parseReolinkAnswer(body: string | null): ReolinkAnswer | null {
    if (!body) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return null;
    }
    if (!Array.isArray(answer) || !answer.length) {
        return null;
    }

    const first = answer[0];
    if (!first || typeof first !== 'object' || first.cmd !== PROBE_COMMAND) {
        return null;
    }

    if (first.error) {
        return { needsAuth: true };
    }

    const info = first.value?.DevInfo;
    return {
        needsAuth: false,
        model: typeof info?.model === 'string' ? info.model : undefined,
        name: typeof info?.name === 'string' ? info.name : undefined,
    };
}

function addInstance(ip: string, protocol: string, info: ReolinkAnswer, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.cameraIp === ip);

    if (instance) {
        options.log.info(`Reolink adapter already present for ${ip}`);
        return false;
    }

    const label = info.name || info.model || 'Reolink camera';

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Reolink ${label} (${ip})`,
        },
        native: {
            cameraIp: ip,
            // whichever protocol actually answered
            cameraProtocol: protocol,
            cameraChannel: 0,
            // Reolink ships a self-signed certificate, so the adapter must not verify it
            sslvalid: false,
        },
        comment: {
            add: [label, ip],
            // The camera answers nothing useful without an account
            inputs: [
                { name: 'native.cameraUser', def: 'admin', type: 'text', title: 'Camera user' },
                { name: 'native.cameraPassword', def: '', type: 'password', title: 'Camera password' },
            ],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let done = false;
    const finish = (found: boolean): void => {
        if (!done) {
            done = true;
            callback(null, found, ip);
        }
    };

    // Newer firmware serves https with its own certificate, older ones plain http - try the
    // adapter's default first and fall back.
    const probe = (protocols: string[]): void => {
        const protocol = protocols.shift();
        if (!protocol) {
            return finish(false);
        }

        tools.httpGet(
            `${protocol}://${ip}/api.cgi?cmd=${PROBE_COMMAND}`,
            // the camera's certificate is self-signed; this is a probe on the local network
            { timeout: PROBE_TIMEOUT, rejectUnauthorized: false },
            (err, data): void => {
                const info = err ? null : parseReolinkAnswer(data);
                if (!info) {
                    return probe(protocols);
                }

                options.log.debug(
                    `Reolink camera detected at ${protocol}://${ip}${info.needsAuth ? ' (needs credentials)' : ''}`,
                );
                finish(addInstance(ip, protocol, info, options));
            },
        );
    };

    probe(['https', 'http']);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
