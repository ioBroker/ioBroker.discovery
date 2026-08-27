import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';
const adapterName = 'g-homa';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // Try to find an existing instance for this IP
    const instance = tools.findInstance(options, adapterName, (): boolean => true); //obj && obj.native && ...
    if (!instance) {
        const id = tools.getNextInstanceID(adapterName, options);
        options.newInstances.push({
            _id: id,
            common: {
                name: adapterName,
            },
            native: {},
            comment: {
                add: [tools.translate(options.language, 'Required for %s', 'G-Homa plugs')],
            },
        });
        callback(true);
    } else {
        callback(false);
    }
}

function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // We need to have _hf_lpb100 data with existing networkSettings
    if (!device._hf_lpb100?.networkSettings || !tools.startsWith(device._hf_lpb100.networkSettings, 'TCP,Client')) {
        return callback(null, false, ip);
    }

    addInstance(ip, device, options, callback);
}

export { detect };
export const type = ['hf-lpb100'];
export const timeout = 1500;
