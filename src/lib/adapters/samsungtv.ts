import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'samsungtv';

// The adapter's default `native.mdnsServices` lists exactly these; the two below are the
// ones only a Samsung TV answers - `_airplay._tcp` alone would also match Apple devices.
const SAMSUNG_SERVICES = ['_samsungmsf._tcp', '_samsungmsf2._tcp', '_samsungtv._tcp', '_samsung._tcp'];

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!SAMSUNG_SERVICES.some(service => tools.hasMdnsService(device, service))) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device);
    options.log.debug(`Samsung TV detected at ${ip}`);
    // Note: the older `samsung` adapter is detected separately - both may be proposed.
    // The adapter scans by itself (`autoScan`), so no address has to be filled in here.
    callback(null, tools.proposeSharedInstance(adapterName, name ? `${name} (${ip})` : ip, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
