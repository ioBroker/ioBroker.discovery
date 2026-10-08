import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'zendure-solarflow';

// Devices with the local zenSDK API announce `Zendure-<model>-<serial>._zendure._tcp.local`
// (https://github.com/Zendure/zenSDK). Older cloud-only devices do not announce anything.
const ZENDURE_SERVICE = '_zendure._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, ZENDURE_SERVICE)) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device);
    options.log.debug(`Zendure device detected at ${ip}`);
    // One instance handles all devices and finds them itself via mDNS - but only outside the default
    // `authKey` mode: without a cloud key that one logs an error and stops before its mDNS browser starts.
    // `local` starts it without an MQTT server in 5.3.x and 6.x; `zenSDK` would be cleaner but needs 6.0.
    callback(
        null,
        tools.proposeSharedInstance(adapterName, name ? `${name} (${ip})` : ip, options, { connectionMode: 'local' }),
        ip,
    );
}

export const type = ['mdns'];
export const timeout = 1500;
