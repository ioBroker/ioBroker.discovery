import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    'use strict';
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    let waiting = false;
    const foundNutServer: Record<string, any> = {};

    tools.testPort(
        ip,
        3493,
        {
            onConnect: (ip, port, client): void => {
                options.log.debug(`Got connection to NUT on ${ip}:${port}`);
                client.write('LIST UPS\n');
            },
            onReceive: (data, ip, port): boolean | null => {
                if (!data) {
                    return false;
                }
                const text: string = Buffer.isBuffer(data) ? data.toString() : data;
                if (typeof text !== 'string') {
                    return false;
                }
                options.log.debug(`Got response from NUT on ${ip}:${port} = ${JSON.stringify(text)}`);
                if (!waiting && text.indexOf('BEGIN') === 0) {
                    waiting = true;
                }

                const consts: Record<string, any> = {};
                const data_array = text.split('\n');
                const re = /^UPS\s+(.+)\s+"(.+)"/;
                for (let i = 0; i < data_array.length - 1; i++) {
                    const line = data_array[i];
                    if (line.indexOf('UPS ') === 0) {
                        const matches = re.exec(line);
                        consts[matches![1]] = matches![2];
                        options.log.debug(`Detected UPS ${matches![1]}@${ip}: ${matches![2]}`);
                    } else if (line.indexOf('END ') === 0) {
                        waiting = false;
                    }
                }
                if (Object.keys(consts).length) {
                    foundNutServer[ip] = consts;
                    if (waiting) {
                        return null;
                    }
                    return true;
                }
                if (waiting) {
                    return null;
                }
                return false;
            },
        },
        (err, found, ip): void => {
            waiting = false;
            if (found) {
                let foundNew = false;
                for (const foundUps in foundNutServer[ip]) {
                    if (!Object.prototype.hasOwnProperty.call(foundNutServer[ip], foundUps)) {
                        continue;
                    }

                    let instance = tools.findInstance(options, 'nut', obj => {
                        //TODO handling 127.0.0.1 vs other IP
                        const matchFound =
                            (obj.native.host_ip === ip || obj.native.host_ip === device._name) &&
                            obj.native.host_port === 3493 &&
                            obj.native.ups_name === foundUps;
                        options.log.debug(`Check existing NUT instances for UPS ${foundUps}@${ip}:${matchFound}`);
                        return matchFound;
                    });

                    if (!instance) {
                        foundNew = true;
                        const name = `${foundUps}@${ip} (${foundNutServer[ip][foundUps]})`;
                        instance = {
                            _id: tools.getNextInstanceID('nut', options),
                            common: {
                                name: 'nut',
                                title: `Network UPS Adapter (${name})`,
                            },
                            native: {
                                host_ip: ip,
                                host_port: 3493,
                                ups_name: foundUps,
                            },
                            comment: {
                                add: [name],
                            },
                        };
                        options.newInstances.push(instance);
                        options.log.debug('Add new NUT Instance');
                    }
                }
                callback(null, foundNew, ip);
            } else {
                callback(null, false, ip);
            }
        },
    );
}

export const type = ['ip']; // make type=serial for USB sticks
export const timeout = 1500;
