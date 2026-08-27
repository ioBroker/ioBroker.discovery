import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, instances: DetectOptions, discovered: ProtocolData, callback: DetectCallback): void {
    let instance = tools.findInstance(
        instances,
        'nuki-extended',
        obj =>
            obj.native.bridges &&
            obj.native.bridges.map((bridge: ProtocolData): any => bridge.id).indexOf(discovered.bridgeId) > -1,
    );

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('nuki-extended', instances),
            common: {
                name: 'nuki-extended',
                title: `Nuki Smartlock & Opener (${ip})`,
            },
            native: {},
            comment: {
                add: [ip],
            },
        };

        instances.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    }
}

export function detect(ip: string, device: DiscoveryDevice, instances: DetectOptions, callback: DetectCallback): void {
    tools.httpGet('https://api.nuki.io/discover/bridges', 1400, (err, result): void => {
        try {
            const bridges = JSON.parse(result!).bridges;
            bridges.forEach(
                (bridge: ProtocolData): any =>
                    // only works for hardware bridges
                    bridge.bridgeId &&
                    bridge.ip === ip &&
                    addInstance(ip, instances, { bridgeId: bridge.bridgeId }, callback),
            );
        } catch (e) {
            callback?.(e, false, ip);
        }
    });
}

export const type = ['ip'];
