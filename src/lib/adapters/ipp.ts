import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'ipp';
const IPP_SERVICES = ['_ipp._tcp', '_ipps._tcp'];

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!IPP_SERVICES.some(service => tools.hasMdnsService(device, service))) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device) || 'IPP printer';
    // The helper reports a newly added proposal; it still appends later printer labels.
    const added = tools.proposeSharedInstance(adapterName, `${name} (${ip})`, options);
    callback(null, added, ip);
}

export const type = ['mdns'];
export const timeout = 1500;
