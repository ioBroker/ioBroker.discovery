// Version 1.0.0 of mielecloudservice lib in discovery

import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'mielecloudservice';
const reIsMieleXGW3000 = /^<\?xml[\s\S]*?<DEVICES>[\s\S]*?\/homebus\/device[\s\S]*?<\/DEVICES>/;

function afterDetection(
    options: DetectOptions,
    deviceName: string,
    ip: string,
    detected: ProtocolData,
    callback: DetectCallback,
): void {
    if (detected) {
        let instance = tools.findInstance(options, adapterName, (): boolean => true);
        if (!instance) {
            instance = {
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `Miele (${ip}${deviceName ? ` - ${deviceName}` : ''})`,
                },
                native: {
                    ip: ip,
                },
                comment: {
                    add: [deviceName, ip],
                },
            };
            options.newInstances.push(instance);
            return callback(null, true, ip);
        }
        return callback(null, false, ip);
    }
    return callback(null, false, ip);
}

function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // options.log.debug("MieleCloudService => device=" + JSON.stringify(device));
    // Miele devices may only be detected via ip & mdns - so quick fail if none of these services
    if (device._source !== 'ip' && device._source !== 'mdns') {
        return callback(null, false, ip);
    }

    let detected = false;
    let deviceName = 'Miele Appliance';

    if (device._source === 'ip') {
        tools.httpGet(`http://${ip}/homebus`, (err, data): void => {
            if (!err && data && reIsMieleXGW3000.test(data)) {
                detected = true;
                deviceName = device.name;
            }
            afterDetection(options, deviceName, ip, detected, callback);
        });
    } else {
        // detection via mdns
        // options.log.debug('device._mdns.PTR: [' + device._mdns.PTR.data + ']');
        if (device._mdns.PTR.data && '_mieleathome._tcp.local' === device._mdns.PTR.data) {
            // options.log.debug('Found by PTR: [' + device._mdns.A.name + ']')
            detected = true;
            deviceName = device._mdns.A.name;
        }
        afterDetection(options, deviceName, ip, detected, callback);
    }
}

export { detect };
export const type = ['mdns', 'ip'];
export const timeout = 1500;
