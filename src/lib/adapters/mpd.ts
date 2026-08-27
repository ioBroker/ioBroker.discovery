import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance } from '../types';

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    tools.testPort(
        ip,
        6600,
        500,
        {
            onConnect: (ip, port, client): void => {
                client.write('noidle\\n');
            },
            onReceive: data => !!data && !!~data.toString().toLowerCase().indexOf('ok mpd'),
        },
        (err, found, ip): void => {
            if (found) {
                let instance = tools.findInstance(options, 'mpd', obj => obj.native.ip === ip);
                if (!instance) {
                    const id = tools.getNextInstanceID('mpd', options);
                    instance = {
                        _id: id,
                        common: {
                            name: 'mpd',
                            enabled: true,
                            title: (obj: DiscoveryInstance): any => obj.common.title,
                        },
                        comment: {
                            add: ['MPD Player ', ip],
                        },
                    } as DiscoveryInstance;
                    options.newInstances.push(instance);
                    instance.native = {
                        ip: ip,
                        port: 6600,
                    };
                    callback?.(null, true, ip);
                } else {
                    callback?.(null, false, ip);
                }
            }
            if (callback) {
                callback(null, found, ip);
                callback = null;
            }
        },
    );
}

export const type = ['ip'];
