import * as http from 'node:http';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(
    ip: string,
    instances: DetectOptions,
    discovered: ProtocolData,
    callback: DetectCallback | null,
): void {
    let instance = tools.findInstance(instances, 'plex', obj => obj.native.plexIp === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('plex', instances),
            common: {
                name: 'plex',
                title: `Plex Media Server (${ip})`,
            },
            native: {},
            comment: {
                add: [ip],
            },
        };

        instances.newInstances.push(instance);
        callback?.(null, true, ip);
    } else {
        callback?.(null, false, ip);
    }
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    instances: DetectOptions,
    callback: DetectCallback | null,
): void {
    const options = { method: 'HEAD', host: ip, port: 32400, path: '/' };
    const request = http
        .request(options, res => {
            if (res?.headers?.['x-plex-protocol'] !== undefined) {
                addInstance(ip, instances, {}, callback);
            } else {
                res.resume();
                callback?.(null, false, ip);
                callback = null;
            }
        })
        .on('error', (): void => {
            callback?.(null, false, ip);
            callback = null;
        });
    request.end();
}

export const type = ['ip'];
