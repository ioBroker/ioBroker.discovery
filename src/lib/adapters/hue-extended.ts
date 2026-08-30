import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addHue(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'hue-extended', obj => obj?.native?.bridgeIp === ip);

    if (!instance) {
        const name = ip + (device._name ? ` - ${device._name}` : '');

        instance = {
            _id: tools.getNextInstanceID('hue-extended', options),
            common: {
                name: 'hue-extended',
            },
            native: {
                bridgeIp: ip,
            },
            comment: {
                add: [name],
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

// just check if IP exists
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if ((!foundInstance && upnp['HUE-BRIDGEID']) || upnp['hue-bridgeid']) {
            if (addHue(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // make type=serial for USB sticks
export const timeout = 500;
