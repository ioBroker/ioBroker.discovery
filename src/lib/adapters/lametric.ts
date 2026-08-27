import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'lametric', obj => obj.native.lametricIp === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('lametric', options),
            common: {
                name: 'lametric',
            },
            native: {
                lametricIp: ip,
            },
            comment: {
                add: 'LaMetric device',
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
        if (!foundInstance && upnp._location && upnp._location.includes('LaMetric Time')) {
            options.log.debug(`LaMetric device detected at: ${ip}`);
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 100;
