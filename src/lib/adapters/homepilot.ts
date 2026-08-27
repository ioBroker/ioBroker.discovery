import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';
// based on miele
const adapterName = 'homepilot';
const reIsHomepilot = /<h1 id="form-container-automation-conflict-detection-title-resolve">/;

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (device._source !== 'ip') {
        return callback(null, false, ip);
    }

    tools.httpGet(`http://${ip}/actor.do`, (err, data): void => {
        if (!err && data && reIsHomepilot.test(data)) {
            let instance = tools.findInstance(options, adapterName, (): boolean => true);
            if (!instance) {
                const name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID(adapterName, options),
                    common: {
                        name: adapterName,
                        title: `Homepilot (${ip}${name ? ` - ${name}` : ''})`,
                    },
                    native: {
                        ip: ip,
                    },
                    comment: {
                        add: [name, ip],
                    },
                };
                options.newInstances.push(instance);
                return callback(null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

export const type = ['ip'];
