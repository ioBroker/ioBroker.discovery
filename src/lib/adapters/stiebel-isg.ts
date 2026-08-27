import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.httpGet(`http://${ip}`, 1500, (err, data): void => {
        if (data && data.includes('alt="Servicewelt"')) {
            let instance = tools.findInstance(options, 'stiebel-isg', obj => obj.native.isgAddress === ip);

            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('stiebel-isg', options),
                    common: {
                        name: 'stiebel-isg',
                        title: `stiebel-isg (${ip}${device._name ? ` - ${device._name}` : ''})`,
                    },
                    native: {
                        isgAddress: ip,
                    },
                    comment: {
                        add: [`stiebel-isg (${ip})`],
                    },
                };
                options.newInstances.push(instance);
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        } else {
            callback(err, false, ip);
        }
    });
}

export const type = ['ip']; // make type=serial for USB sticks
export const timeout = 1500;
