import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'heos';
const searchDeviceType = 'urn:schemas-denon-com:device:ACT-Denon:1';

function addHeos(ip: string, data: ProtocolData, options: DetectOptions): boolean {
    let instance;
    for (let j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === adapterName) {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (let i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === adapterName) {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                break;
            }
        }
    }

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: 'HEOS',
            },
            native: {},
            comment: {
                add: 'HEOS',
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
        if (!foundInstance && JSON.stringify(upnp).includes(searchDeviceType)) {
            options.log.debug(`HEOS found: ${JSON.stringify(upnp)}`);
            if (addHeos(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 100;
