import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'frontier_silicon', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('frontier_silicon', options);
        instance = {
            _id: id,
            common: {
                name: 'frontier_silicon',
            },
            native: {
                IP: ip,
                PIN: '1234',
            },
            comment: {
                add: `Frontier Smart Device ${device._name} (${ip})`,
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
        if (!foundInstance && upnp.ST && upnp.ST === 'urn:schemas-frontier-silicon-com:undok:fsapi:1') {
            if (upnp['SPEAKER-NAME']) {
                device._name = upnp['SPEAKER-NAME'];
            } else {
                device._name = 'UNDOK';
            }
            if (addInstance(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 500;
