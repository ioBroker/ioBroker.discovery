import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addMegaDDevice(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    native: ProtocolData,
    callback: DetectCallback | null,
): void {
    let instance = tools.findInstance(options, 'megad', obj => obj.native.ip === ip || obj.native.ip === device._name);
    if (!instance) {
        const name = ip + (device._name ? ` - ${device._name}` : '');

        instance = {
            _id: tools.getNextInstanceID('megad', options),
            common: {
                name: 'megad',
                title: `MegaD-328 (${ip}${device._name ? ` - ${device._name}` : ''})`,
            },
            native: native,
            comment: {
                add: [name],
            },
        };
        options.newInstances.push(instance);
        typeof callback === 'function' && callback(null, true, ip);
    } else {
        typeof callback === 'function' && callback(null, false, ip);
    }
}

// just check if IP exists
export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }
    tools.httpGet(`http://${ip}/wrg/?cf=1`, (err, data): void => {
        if (err || !data || data.length > 100 || data.indexOf('Unauthorized') === -1) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            tools.httpGet(`http://${ip}/sec/`, (err, data): void => {
                if (data && data.includes('MegaD-328')) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(
                        ip,
                        device,
                        options,
                        {
                            ip: ip,
                        },
                        callback,
                    );
                } else if (data && data.includes('MegaD-2561')) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(
                        ip,
                        device,
                        options,
                        {
                            ip: ip,
                        },
                        callback,
                    );
                } else if (data && data.includes('MegaESP')) {
                    // todo read config and distinguish between megad, megadd, megaesp
                    addMegaDDevice(
                        ip,
                        device,
                        options,
                        {
                            ip: ip,
                        },
                        callback,
                    );
                } else {
                    if (callback) {
                        callback(null, false, ip);
                        callback = null;
                    }
                }
            });
        }
    });
}
export const type = ['ip']; // make type=serial for USB sticks
