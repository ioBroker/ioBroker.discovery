import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    let instance;
    let fromOldInstances = false;
    for (let j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === 'ping') {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (let i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'ping') {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                fromOldInstances = true;
                break;
            }
        }
    }
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('ekey', options),
            common: {
                name: 'ekey',
                title: `ekey (${ip})`,
            },
            native: {
                devices: [],
            },
            comment: {
                add: [],
            },
        };
        options.newInstances.push(instance);
    } else {
        instance.native = instance.native || {};
        instance.native.devices = instance.native.devices || [];
    }

    if (!instance.native.devices.find((dev: ProtocolData): boolean => dev.ip === ip)) {
        instance.native.devices.push({ ip: ip, protocol: 'home' });
        if (fromOldInstances) {
            options.newInstances.push(instance);
            instance.comment = instance.comment || {};
        }
        if (instance.comment.ack) {
            instance.comment.ack = false;
        }

        if (!instance.comment.add) {
            instance.comment.extended = instance.comment.extended || [];
            instance.comment.extended.push(device._name || ip);
        } else {
            instance.comment.add.push(device._name || ip);
        }
    }

    if (callback) {
        callback(null, !instance, ip);
        callback = null;
    }
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    const browse = Buffer.from([
        0x01, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18,
    ]);

    tools.udpScan(ip, 58009, '0.0.0.0', 1236, browse, 1400, (err, data): void => {
        if (!err && data) {
            addInstance(ip, device, options, callback);
        } else {
            err && options.log.error(`eky error ${err as any}`);
            callback?.(null, false, ip);
        }
    });
}

export const type = ['ip']; // make type=serial for USB sticks // TODO check if udp
// The probe itself runs up to 1400 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const EKEY_PROBE_TIMEOUT = 1400;
export const timeout = EKEY_PROBE_TIMEOUT + 300;
