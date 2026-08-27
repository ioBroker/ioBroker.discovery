import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';
// based on miele
const adapterName = 'epson_stylus_px830';
const reIsEpsonPX830 = /<div class='tvboxlarge'>Epson Stylus Photo PX830<\/div>/;

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.httpGet(`http://${ip}/actor.do`, 1400, (err, data): void => {
        if (!err && data && reIsEpsonPX830.test(data)) {
            let instance = tools.findInstance(options, adapterName, (): boolean => true);
            if (!instance) {
                const name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID(adapterName, options),
                    common: {
                        name: adapterName,
                        title: `Epson Stylus PX830 (${ip}${name ? ` - ${name}` : ''})`,
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
export const timeout = 1500;
