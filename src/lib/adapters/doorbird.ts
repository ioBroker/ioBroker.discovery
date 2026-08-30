import * as tools from '../tools';
import * as http from 'node:http';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    native: ProtocolData,
    callback: DetectCallback | null,
): void {
    let instance = tools.findInstance(options, 'doorbird', obj => obj.native.birdip === ip);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('doorbird', options),
            common: {
                name: 'doorbird',
                title: `DoorBird (${ip})`,
            },
            native: {
                birdip: ip,
            },
            comment: {
                add: [ip],
            },
        };
        options.newInstances.push(instance);
        callback?.(null, true, ip);
    } else {
        callback?.(null, false, ip);
    }
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    http.get(`http://${ip}/bha-api/info.cgi`, res => {
        if (res?.headers['www-authenticate']?.includes('DoorBird')) {
            addInstance(ip, device, options, { ip }, callback);
        } else {
            res.resume();
            callback?.(null, false, ip);
            callback = null;
        }
    }).on('error', (): void => {
        callback?.(null, false, ip);
        callback = null;
    });
}

export const type = ['ip'];
export const timeout = 1500;
