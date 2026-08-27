import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance, ProtocolData } from '../types';

function addDevice(ip: string, xml: ProtocolData, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'kodi', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('kodi', options);
        const name = xml.match(/<friendlyName>(.*?)<\/friendlyName>/)[1];
        instance = {
            _id: id,
            common: {
                name: 'kodi',
                enabled: true,
                title: (obj: DiscoveryInstance): any => obj.common.title,
            },
            comment: {
                add: [name, ip],
            },
        } as DiscoveryInstance;

        options.newInstances.push(instance);

        instance.native = {
            ip,
            port: 9090,
            portweb: 8080,
            login: '',
            password: '',
        };

        return true;
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (
            !foundInstance &&
            upnp._location &&
            upnp._location.includes('Kodi') &&
            upnp.ST &&
            upnp.ST.includes('MediaRenderer')
        ) {
            if (addDevice(ip, upnp._location, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 5000;
