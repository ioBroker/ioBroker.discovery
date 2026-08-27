import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addbosesoundtouch(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'bosesoundtouch', obj => obj && obj.native && obj.native.address === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('bosesoundtouch', options),
            common: {
                name: 'bosesoundtouch',
                title: device.bosename,
            },
            native: {
                address: ip,
            },
            comment: {
                add: [`Bose Soundtouch ${device.bosename} (${ip})`],
            },
        };
        options.newInstances.push(instance);
        options.log.debug(`Add new Bose Soundtouch Instance ${device.bosename}`);
        return true;
    }
    return false;
}

// just check if IP exists
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp.USN && upnp.USN.includes('BO5E') && upnp._location) {
            const name = upnp._location.substring(upnp._location.indexOf('<friendlyName>') + 14);
            device.bosename = name.substring(0, name.indexOf('<'));
            options.log.debug(`Bode discovered: ${device.bosename}`);

            if (addbosesoundtouch(ip, device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // make type=serial for USB sticks
export const timeout = 100;
