import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const name = ip + (device._name ? ` - ${device._name}` : '');

    tools.httpGet(`https://${ip}:8006/api2/json/access/ticket`, (err, data): void => {
        data = JSON.stringify(data);
        if (data === '{"data":null}' || err === 'unable to verify the first certificate') {
            let instance = tools.findInstance(options, 'proxmox', obj => obj.native.ip === ip);

            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('proxmox', options),
                    common: {
                        name: 'proxmox',
                        enabled: true,
                        title: `proxmox (${ip}${device._name ? ` - ${device._name}` : ''})`,
                    },
                    native: {
                        ip: ip,
                        port: 8006,
                    },
                    comment: {
                        add: [name],
                    },
                };
                options.newInstances.push(instance);
            }
            callback(null, true, ip);
        } else {
            callback(null, false, ip);
        }
    });
}

export const type = ['ip']; // make type=serial for USB sticks
