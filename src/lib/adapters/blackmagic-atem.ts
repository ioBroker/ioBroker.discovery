import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'blackmagic-atem';

// Seen on a real ATEM SDI Pro ISO: it announces `_switcher_ctrl._udp` on port 9910 (the ATEM
// control port), with a `unique id` TXT entry. Bitfocus Companion's ATEM module browses the same type.
const ATEM_SERVICE = '_switcher_ctrl._udp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, ATEM_SERVICE)) {
        return callback(null, false, ip);
    }

    // One instance per switcher, addressed by `native.host`
    if (tools.findInstance(options, adapterName, obj => obj.native.host === ip)) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device) || 'ATEM';
    options.log.debug(`Blackmagic ATEM detected at ${ip}`);
    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: { name: adapterName },
        native: { host: ip, model: 'auto', reconnectInterval: 5000 },
        comment: { add: [name, ip] },
    });
    callback(null, true, ip);
}

export const type = ['mdns'];
export const timeout = 1500;
