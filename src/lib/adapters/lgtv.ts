import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'lgtv', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('lgtv', options);
        instance = {
            _id: id,
            common: {
                name: 'lgtv',
            },
            native: {
                ip: ip,
            },
            comment: {
                add: `LG WebOS TV - ${ip}`,
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
        if (!foundInstance && upnp.ST && upnp.ST === 'urn:lge-com:service:webos-second-screen:1') {
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 500;
