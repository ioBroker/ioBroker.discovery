import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'elgato-key-light';

// Read out of the adapter's own ElgatoDiscovery: it browses for the `elg` service
const ELGATO_SERVICE = '_elg._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, ELGATO_SERVICE)) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device);
    options.log.debug(`Elgato Key Light detected at ${ip}`);
    // The adapter runs its own discovery and fills `native.devices` itself
    callback(null, tools.proposeSharedInstance(adapterName, name ? `${name} (${ip})` : ip, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
