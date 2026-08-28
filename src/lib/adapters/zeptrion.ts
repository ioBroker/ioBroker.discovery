import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'zeptrion';

// The adapter browses the `zapp` service with bonjour-service
const ZAPP_SERVICE = '_zapp._tcp';

/**
 * Unlike the other mDNS adapters of this group, zeptrion keeps a real device list in
 * `native.devices`. Only `host` is required - the adapter derives `id` and `name` from it
 * on first start.
 */
function addInstance(ip: string, name: string, options: DetectOptions): boolean {
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
    if (devices.find((entry: ProtocolData): boolean => entry.host === ip)) {
        // already known to this instance
        return false;
    }

    devices.push(name ? { host: ip, name } : { host: ip });

    if (instance._existing && before === options.newInstances.length) {
        // extending an instance that is already configured
        options.newInstances.push(instance);
    }

    instance.comment ||= {};
    if (instance.comment.ack) {
        instance.comment.ack = false;
    }
    const list: string[] = instance.comment.add || (instance.comment.extended ||= []);
    list.push(name ? `${name} (${ip})` : ip);

    return before !== options.newInstances.length;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, ZAPP_SERVICE)) {
        return callback(null, false, ip);
    }

    options.log.debug(`Feller zeptrion detected at ${ip}`);
    callback(null, addInstance(ip, tools.mdnsName(device), options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
