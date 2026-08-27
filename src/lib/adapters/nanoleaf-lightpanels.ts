import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, port: number, nanoLeafDeviceInfo: ProtocolData, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'nanoleaf-lightpanels', obj => obj.native.host === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('nanoleaf-lightpanels', options);
        instance = {
            _id: id,
            common: {
                name: 'nanoleaf-lightpanels',
            },
            native: {
                host: ip,
                port: port ? port : '16021',
            },
            comment: {
                add: nanoLeafDeviceInfo,
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const SSDP_ST = ['nanoleaf_aurora:light', 'nanoleaf:nl29']; // nanoleaf SSDP service type
    let foundInstance = false;
    let NLdeviceInfo;
    let port: any;
    const locationPattern = new RegExp('http://([0-9a-zA-Z.]+):([0-9]{1,5})', 'gi');

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp.ST && SSDP_ST.includes(upnp.ST)) {
            // parse location string to get port
            const locationGroup = locationPattern.exec(upnp.LOCATION);
            if (locationGroup && locationGroup.length == 3) {
                port = locationGroup[2];
            }
            // if NL-DEVICENAME present use this for device information
            if (upnp['NL-DEVICENAME']) {
                NLdeviceInfo = `${upnp['NL-DEVICENAME']} - ${ip}`;
            } else {
                NLdeviceInfo = `Nanoleaf device - ${ip}`;
            }
            if (addInstance(ip, port, NLdeviceInfo, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp'];
export const timeout = 500;
