import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance } from '../types';

function addInstance(ip: string, options: DetectOptions, cb: (...args: any[]) => void): void {
    let instance = tools.findInstance(options, 'mclighting', obj => obj.native.host === ip);
    if (!instance) {
        const id = tools.getNextInstanceID('mclighting', options);
        instance = {
            _id: id,
            common: {
                name: 'mclighting',
                enabled: true,
                title: (obj: DiscoveryInstance): any => obj.common.title,
            },
            comment: {
                add: ['MC Lighting ', ip],
            },
        } as DiscoveryInstance;
        options.newInstances.push(instance);
        instance.native = {
            host: ip,
            port: 80,
        };
        cb?.(true);
    } else {
        cb?.(false);
    }
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    tools.httpGet(`http://${ip}`, 2000, (err, data): void => {
        if (err || !data || ~data.indexOf('Unauthorized')) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            if (data && ~data.indexOf('Mc Lighting')) {
                addInstance(ip, options, (state: boolean): void => {
                    callback?.(null, state, ip);
                    callback = null;
                });
            } else {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            }
        }
    });
}

export const type = ['ip'];

// The probe itself runs up to 2000 ms, which is exactly the default budget. main.js arms its
// watchdog with the value below *before* it calls detect(), so it has to be the larger of the two -
// otherwise the watchdog wins the race and a late answer is thrown away.
const MCLIGHTING_PROBE_TIMEOUT = 2000;
export const timeout = MCLIGHTING_PROBE_TIMEOUT + 300;
