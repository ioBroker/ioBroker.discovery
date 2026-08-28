import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'shelly';

// Generation 1 announces itself on _http._tcp with a host name like `shelly1-A4CF12`,
// generation 2 and newer bring their own service type. Both start with `shelly`.
const SHELLY_SERVICE = '_shelly._tcp';
const SHELLY_NAME = /^shelly/i;

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const name = tools.mdnsName(device);
    if (!tools.hasMdnsService(device, SHELLY_SERVICE) && !SHELLY_NAME.test(name)) {
        return callback(null, false, ip);
    }

    options.log.debug(`Shelly device detected at ${ip}`);
    // The shelly adapter reaches every device through one MQTT or CoAP instance and keeps no
    // per-device address, so one instance covers the whole network.
    callback(null, tools.proposeSharedInstance(adapterName, name ? `${name} (${ip})` : ip, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
