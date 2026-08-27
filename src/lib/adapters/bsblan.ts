import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'bsblan';

function addInstance(ip: string, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, adapterName, obj => obj.native.ip === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
            },
            native: {
                host: ip,
            },
            comment: {
                add: ['BSB-LAN', ip],
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (device._mdns && device._mdns.name && device._mdns.name.indexOf('BSB-LAN') === 0) {
        callback(null, addInstance(ip, options), ip);
    } else {
        callback(null, false, ip);
    }
}

export const type = ['mdns'];
export const timeout = 1500;
