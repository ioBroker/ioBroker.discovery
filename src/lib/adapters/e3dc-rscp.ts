import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addE3dcRscp(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'e3dc-rscp', (): boolean => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('e3dc-rscp', options),
            common: {
                name: 'e3dc-rscp',
            },
            native: {
                e3dc_ip: ip,
            },
            comment: {
                add: 'E3/DC (RSCP) device',
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

// Detects E3/DC device
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp.SERVER && upnp.SERVER.includes('RSCP_SERVICE_PROVIDER')) {
            options.log.debug(`E3/DC RSCP device detected at: ${ip}`);
            if (addE3dcRscp(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 100;
