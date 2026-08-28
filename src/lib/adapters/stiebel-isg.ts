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
// The probe itself runs up to 1500 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const ISG_PROBE_TIMEOUT = 1500;
export const timeout = ISG_PROBE_TIMEOUT + 300;
