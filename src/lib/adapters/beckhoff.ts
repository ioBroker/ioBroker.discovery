import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addBeckhoff(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'beckhoff', (): boolean => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('beckhoff', options),
            common: {
                name: 'beckhoff',
            },
            native: {
                targetIpAdress: ip,
                targetAmsNetId: `${ip}.1.1`,
                sourceAmsNetId: `${tools.getOwnAddress(ip)}.1.1`,
            },
            comment: {
                add: 'beckhoff',
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

// Detects Beckhoff Device
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp.USN && upnp.USN.includes('beckhoff.com')) {
            options.log.debug(`Beckhoff Device detected at: ${ip}`);
            if (addBeckhoff(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 100;
