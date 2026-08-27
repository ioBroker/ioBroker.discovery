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
        'smappee',
        obj => obj.native.ip === ip || obj.native.ip === device._name,
    );

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('smappee', options),
            common: {
                name: 'smappee',
                title: `smappee (${ip}${device._name ? ` - ${device._name}` : ''})`,
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
    tools.httpGet(`http://${ip}/smappee.html`, (err, data): void => {
        if (err && !data) {
            callback?.(null, false, ip);
            callback = null;
        } else if (data) {
            if (data.includes('>Smappee')) {
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
