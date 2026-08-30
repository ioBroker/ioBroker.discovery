import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addHue(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(
        options,
        'hue',
        obj => obj?.native && (obj.native.bridge === ip || obj.native.webServer === device._name),
    );

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('hue', options),
            common: {
                name: 'hue',
            },
            native: {
                bridge: ip,
            },
            comment: {
                add: [tools.translate(options.language, 'for %s', ip)],
                inputs: [
                    {
                        name: 'native.user',
                        def: '',
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'user', // see translation in words.js
                    },
                ],
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
