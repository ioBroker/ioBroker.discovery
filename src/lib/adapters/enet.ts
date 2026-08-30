import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'enet', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('enet', options);
        instance = {
            _id: id,
            common: {
                name: 'enet',
            },
            native: {
                ip: ip,
            },
            comment: {
                add: `eNet device - ${ip}`,
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp._location?.includes('Albrecht Jung')) {
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // make to upnp call location
export const timeout = 100;
