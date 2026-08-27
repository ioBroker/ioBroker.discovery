import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    native: ProtocolData,
    callback: DetectCallback | null,
): void {
    let instance = tools.findInstance(
        options,
        'solarlog',
        obj => obj.native.ip === ip || obj.native.ip === device._name,
    );

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('solarlog', options),
            common: {
                name: 'solarlog',
                title: `solarlog (${ip}${device._name ? ` - ${device._name}` : ''})`,
            },
            native: {
                host: ip,
            },
            comment: {
                add: [ip],
            },
        };
        options.newInstances.push(instance);
        callback?.(null, true, ip);
    } else {
        callback?.(null, false, ip);
    } // endElse
} // endAddSonnen

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    tools.httpGet(`http://${ip}`, (err, data): void => {
        if (err || !data) {
            callback?.(null, false, ip);
            callback = null;
        } else if (data) {
            let testData;
            try {
                testData = JSON.stringify(data);
            } catch {
                testData = null;
            }

            // BF here was `testData.includes('solar-log')` but object cannot include anything
            if (testData && data.includes('solar-log')) {
                addInstance(
                    ip,
                    device,
                    options,
                    {
                        ip,
                    },
                    callback,
                );
            } else {
                callback?.(null, false, ip);
                callback = null;
            }
        } else {
            callback?.(null, false, ip);
            callback = null;
        }
    });
}

export const type = ['ip'];
export const timeout = 1500;
