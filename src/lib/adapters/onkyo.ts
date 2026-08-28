import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance, ProtocolData } from '../types';

function addInstance(type: string, result: ProtocolData, options: DetectOptions, cb: (...args: any[]) => void): void {
    let instance = tools.findInstance(options, 'onkyo', obj => obj.native.avrAddress === result.host);
    if (!instance) {
        const id = tools.getNextInstanceID('onkyo', options);
        type = type.toUpperCase();
        instance = {
            _id: id,
            common: {
                name: 'onkyo',
                enabled: true,
                title: (obj: DiscoveryInstance): any => obj.common.title,
            },
            comment: {
                add: [`${type} ${result.model}`, result.host],
            },
        } as DiscoveryInstance;
        options.newInstances.push(instance);
        instance.native = {
            avrAddress: result.host,
            avrPort: result.port,
            maxvolzone1: 40,
            maxvolzone2: 40,
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
    function cb(err: unknown, is: boolean, ip: string): void {
        if (callback) {
            callback(err, is, ip);
            callback = null;
        }
    }

    const onkyoPacket = Buffer.from([
        73, 83, 67, 80, 0, 0, 0, 16, 0, 0, 0, 11, 1, 0, 0, 0, 33, 120, 69, 67, 78, 81, 83, 84, 78, 13, 10,
    ]);
    const pioneerPacket = Buffer.from([
        73, 83, 67, 80, 0, 0, 0, 16, 0, 0, 0, 11, 1, 0, 0, 0, 33, 112, 69, 67, 78, 81, 84, 83, 78, 13, 10,
    ]);

    tools.udpScan(ip, 60128, '0.0.0.0', 1235, onkyoPacket, 5000, (err, data, remote): void => {
        if (!err && data && remote) {
            const type = 'onkyo';
            const message = data.toString().slice(18, data.length - 6);
            const command = message.slice(0, 3);
            let _data;
            if (command === 'ECN') {
                _data = message.slice(3).split('/');
                const result = {
                    host: remote.address,
                    port: _data[1],
                    model: _data[0],
                };
                addInstance(type, result, options, (state: boolean): void => {
                    if (state) {
                        cb(null, true, ip);
                    } else {
                        cb(null, false, ip);
                    }
                });
            } else {
                cb(null, false, ip);
            }
        } else {
            err && options.log.warn(`Onkyo AVR discovery error ${err as any}`);
            cb(null, false, ip);
        }
    });

    tools.udpScan(ip, 60128, '0.0.0.0', 1237, pioneerPacket, 5000, (err, data, remote): void => {
        if (!err && data && remote) {
            const type = 'pioneer';
            const message = data.toString().slice(18, data.length - 6);
            const command = message.slice(0, 3);
            let _data;

            if (command === 'ECN') {
                _data = message.slice(3).split('/');
                const result = {
                    host: remote.address,
                    port: _data[1],
                    model: _data[0],
                };
                addInstance(type, result, options, (state: boolean): void => {
                    if (state) {
                        cb(null, true, ip);
                    } else {
                        cb(null, false, ip);
                    }
                });
            } else {
                cb(null, false, ip);
            }
        } else {
            err && options.log.warn(`Pioneer AVR discovery error ${err as any}`);
            cb(null, false, ip);
        }
    });
}

export const type = ['ip'];
// The probe itself runs up to 5000 ms - the Onkyo and the Pioneer scan run in parallel, so it is
// 5000, not 10000. main.js arms its watchdog with the value below *before* it calls detect(), so it
// has to be the larger of the two - otherwise the watchdog wins the race and a late answer is
// thrown away.
const ONKYO_PROBE_TIMEOUT = 5000;
export const timeout = ONKYO_PROBE_TIMEOUT + 300;
