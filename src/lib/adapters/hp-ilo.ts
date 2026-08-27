import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'hp-ilo', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('hp-ilo', options);
        instance = {
            _id: id,
            common: {
                name: 'hp-ilo',
            },
            native: {
                ip: ip,
            },
            comment: {
                add: `HP ILO management - ${ip}`,
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
        if (!foundInstance && upnp._location && upnp._location.includes('HP-iLO')) {
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; //TODO check if location call is needed
export const timeout = 500;
