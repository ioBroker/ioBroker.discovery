import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';
const adapterName = 'valloxmv';

function addValloxmv(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, adapterName, obj => obj?.native?.host === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('valloxmv', options),
            common: {
                name: 'valloxmv',
            },
            native: {
                host: ip,
            },
            comment: {
                add: `ValloxMV - ${ip}`,
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp.SERVER?.includes('vallox')) {
            options.log.debug(`ValloxMV Device detected at: ${ip}`);
            if (addValloxmv(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export { detect };
export const type = ['upnp'];
export const timeout = 1500;
