import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'blebox';

// Every blebox module of the adapter reads /api/device/state and takes device.deviceName,
// device.type, device.fv, device.hv and device.id out of it.
const BLEBOX_PORT = 80;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

// The values the adapter offers in its device table. `/api/device/state` reports them in
// camel case ("switchBox"), the table expects them lower case - and `tempSensorAC` is the
// one exception that keeps its capitals.
const KNOWN_TYPES = [
    'airsensor',
    'gatebox',
    'multisensor',
    'saunabox',
    'shutterbox',
    'switchbox',
    'switchboxd',
    'humiditySensor',
    'rainSensor',
    'floodSensor',
    'tempSensorAC',
];

export interface BleboxDevice {
    name?: string;
    /** the adapter's `dev_type`, empty when the reported type is not one it offers */
    type: string;
    id?: string;
}

/**
 * Read the device description out of an /api/device/state answer.
 *
 * @param body the raw answer
 */
export function parseBleboxState(body: string | null): BleboxDevice | null {
    if (!body) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return null;
    }
    const device = answer?.device;
    if (!device || typeof device !== 'object' || typeof device.type !== 'string') {
        return null;
    }
    // `id` and a name are what tell a blebox apart from any other JSON on port 80
    if (typeof device.id !== 'string' && typeof device.deviceName !== 'string') {
        return null;
    }

    const reported = device.type;
    const match = KNOWN_TYPES.find(known => known.toLowerCase() === reported.toLowerCase());

    return {
        name: typeof device.deviceName === 'string' ? device.deviceName : undefined,
        // leave it empty rather than write a value the adapter does not offer
        type: match || '',
        id: typeof device.id === 'string' ? device.id : undefined,
    };
}

function addInstance(ip: string, info: BleboxDevice, options: DetectOptions): boolean {
    const before = options.newInstances.length;
    let instance = tools.findInstance(options, adapterName);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
            },
            native: {
                devices: [],
            },
            comment: {
                add: [],
            },
        };
        options.newInstances.push(instance);
    }

    instance.native.devices ||= [];
    const devices = instance.native.devices as ProtocolData[];
    if (devices.find((entry: ProtocolData): boolean => entry.dev_ip === ip)) {
        return false;
    }

    devices.push({
        dev_name: info.name || info.id || ip,
        smart_name: '',
        dev_ip: ip,
        dev_port: String(BLEBOX_PORT),
        polling: '360',
        dev_type: info.type,
    });

    if (instance._existing && before === options.newInstances.length) {
        options.newInstances.push(instance);
    }

    instance.comment ||= {};
    if (instance.comment.ack) {
        instance.comment.ack = false;
    }
    const list: string[] = instance.comment.add || (instance.comment.extended ||= []);
    list.push([info.name || 'blebox', info.type || 'type unknown', ip].join(', '));

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

    tools.httpGet(`http://${ip}:${BLEBOX_PORT}/api/device/state`, PROBE_TIMEOUT, (err, data): void => {
        if (err) {
            return finish(false);
        }
        const info = parseBleboxState(data);
        if (!info) {
            return finish(false);
        }

        options.log.debug(`blebox ${info.type || 'device'} detected at ${ip}`);
        finish(addInstance(ip, info, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
