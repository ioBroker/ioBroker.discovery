import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'homewizard';

// The adapter's discovery module browses `hwenergy`; older firmware announced `homewizard`
const HOMEWIZARD_SERVICES = ['_hwenergy._tcp', '_homewizard._tcp'];

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!HOMEWIZARD_SERVICES.some(service => tools.hasMdnsService(device, service))) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device);
    options.log.debug(`HomeWizard Energy device detected at ${ip}`);
    // `native` is empty by design - the adapter discovers and manages its devices itself
    callback(null, tools.proposeSharedInstance(adapterName, name ? `${name} (${ip})` : ip, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
