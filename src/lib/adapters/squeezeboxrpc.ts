import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
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
    tools.testPort(
        ip,
        9090,
        500,
        {
            onConnect: (ip, port, client): void => {
                options.log.debug(`squeezeboxrpc: Got connection to possible LMS on ${ip}:${port}`);
                client.write('player count ?\n');
            },
            onReceive: (data, ip, port): boolean => {
                if (!data) {
                    return false;
                }
                const text: string = Buffer.isBuffer(data) ? data.toString() : data;
                if (typeof text !== 'string') {
                    return false;
                }
                const trimmed = text.trim();
                options.log.debug(`squeezeboxrpc: Got response from possible LMS on ${ip}:${port} = ${trimmed}`);
                return /^player count \d+$/i.test(trimmed);
            },
        },
        (err, found, ip): void => {
            if (found) {
                let instance = tools.findInstance(
                    options,
                    'squeezeboxrpc',
                    obj => obj.native.server === ip || obj.native.server === device._name,
                );

                if (!instance) {
                    instance = {
                        _id: tools.getNextInstanceID('squeezeboxrpc', options),
                        common: {
                            name: 'squeezeboxrpc',
                            title: `squeezeboxrpc Server (${ip})`,
                        },
                        native: {
                            server: ip,
                            elapsedInterval: 5,
                        },
                        comment: {
                            add: [ip],
                        },
                    };
                    options.newInstances.push(instance);
                    options.log.debug(`squeezeboxrpc: Adding new instance: ${ip}`);
                    callback(null, true, ip);
                    return;
                }
            }
            callback(null, false, ip);
        },
    );
}

export const type = ['ip'];
