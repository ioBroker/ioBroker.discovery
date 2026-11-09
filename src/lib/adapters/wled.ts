import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'wled';

// Read out of the adapter's own scanDevices(): it browses for the `wled` service
const WLED_SERVICE = '_wled._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, WLED_SERVICE)) {
        return callback(null, false, ip);
    }

    options.log.debug(`WLED detected at ${ip}`);
    // One instance finds every WLED on the network itself and keeps them as device objects,
    // nothing in `native` says which devices it has
    callback(
        null,
        tools.proposeSharedInstance(adapterName, `${tools.mdnsName(device) || 'WLED'} (${ip})`, options),
        ip,
    );
}

export const type = ['mdns'];
export const timeout = 1500;
