import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'wled', obj =>
        obj.native.devices.filter((device: ProtocolData): boolean => device.ip === ip),
    );

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('wled', options),
            common: {
                name: 'wled',
            },
            native: {
                devices: {
                    wled: {
                        ip,
                    },
                },
            },
            comment: {
                add: ['WLED', ip],
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (device?._mdns?.PTR && device._mdns.PTR.datax.includes('_wled._tcp.local')) {
        callback(null, addInstance(ip, options), ip);
    } else {
        callback(null, false, ip);
    }
}

export const type = ['mdns'];
export const timeout = 1500;
