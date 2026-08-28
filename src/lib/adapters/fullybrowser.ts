import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'fullybrowser';

// The adapter builds `<protocol>://<ip>:<restPort>/?cmd=deviceInfo&type=json&password=...`
// and reads `status` / `statustext` from the answer. Without the remote admin password the
// tablet still answers JSON - with `statustext: "Please login"`, which the adapter's own
// error path names. That answer is proof enough of a Fully Kiosk Browser.
const FULLY_PORT = 2323;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

export interface FullyInfo {
    /** the tablet answered, but the remote admin password is needed to read anything */
    needsPassword: boolean;
    name?: string;
}

/**
 * Read the answer of `?cmd=deviceInfo&type=json`.
 *
 * @param body the raw answer
 */
export function parseFullyAnswer(body: string | null): FullyInfo | null {
    if (!body) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return null;
    }
    if (!answer || typeof answer !== 'object' || typeof answer.status !== 'string') {
        return null;
    }

    if (answer.status.includes('Error')) {
        // only the login hint is proof; any other error could come from anywhere
        return typeof answer.statustext === 'string' && /please login/i.test(answer.statustext)
            ? { needsPassword: true }
            : null;
    }

    // With no password set the tablet answers the device info right away
    const name = answer.deviceName || answer.deviceModel || answer.deviceID;
    return { needsPassword: false, name: typeof name === 'string' ? name : undefined };
}

function addInstance(ip: string, info: FullyInfo, options: DetectOptions): boolean {
    const before = options.newInstances.length;
    let instance = tools.findInstance(options, adapterName);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
            },
            native: {
                tableDevices: [],
            },
            comment: {
                add: [],
            },
        };
        options.newInstances.push(instance);
    }

    instance.native.tableDevices ||= [];
    const devices = instance.native.tableDevices as ProtocolData[];
    if (devices.find((entry: ProtocolData): boolean => entry.ip === ip)) {
        return false;
    }

    devices.push({
        enabled: true,
        apiType: 'restapi',
        name: info.name || ip,
        restProtocol: 'http',
        ip,
        restPort: FULLY_PORT,
    });

    if (instance._existing && before === options.newInstances.length) {
        options.newInstances.push(instance);
    }

    instance.comment ||= {};
    if (instance.comment.ack) {
        instance.comment.ack = false;
    }
    const list: string[] = instance.comment.add || (instance.comment.extended ||= []);
    list.push(`${info.name || 'Fully Kiosk Browser'} (${ip})`);

    if (info.needsPassword) {
        // Without it the adapter can send no command at all
        instance.comment.inputs ||= [];
        if (!instance.comment.inputs.length) {
            instance.comment.inputs.push({
                name: 'native.tableDevices.0.restPassword',
                def: '',
                type: 'password',
                title: 'Fully Kiosk remote admin password',
            });
        }
    }

    return before !== options.newInstances.length;
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

    tools.httpGet(`http://${ip}:${FULLY_PORT}/?cmd=deviceInfo&type=json`, PROBE_TIMEOUT, (err, data): void => {
        if (err) {
            return finish(false);
        }
        const info = parseFullyAnswer(data);
        if (!info) {
            return finish(false);
        }

        options.log.debug(`Fully Kiosk Browser detected at ${ip}${info.needsPassword ? ' (password needed)' : ''}`);
        finish(addInstance(ip, info, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
