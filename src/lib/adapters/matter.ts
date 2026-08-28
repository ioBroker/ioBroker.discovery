import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'matter';

// Service types taken from the Matter reference implementation (@matter/protocol):
//   _matterc._udp  a node waiting to be commissioned
//   _matter._tcp   a node that is already part of a fabric
//   _matterd._udp  a commissioner, i.e. another controller - deliberately not matched here,
//                  otherwise every Apple TV or Google hub would propose the matter adapter
const COMMISSIONABLE = '_matterc._udp';
const OPERATIONAL = '_matter._tcp';

/**
 * Build the label from the TXT record the device announced.
 *
 * `DN` is the device name, `VP` the vendor and product id as `vendor+product`. Both are
 * optional, so the announced host name stays the fallback.
 */
function describe(device: DiscoveryDevice, ip: string): string {
    const txt = tools.mdnsTxt(device);
    const name = txt.DN || tools.mdnsName(device);
    const vendorProduct = txt.VP ? ` [${txt.VP}]` : '';
    return `${name || ip}${vendorProduct} (${ip})`;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const commissionable = tools.hasMdnsService(device, COMMISSIONABLE);
    const operational = tools.hasMdnsService(device, OPERATIONAL);

    if (!commissionable && !operational) {
        return callback(null, false, ip);
    }

    // A node that is already in a fabric is most likely paired to the very instance we would
    // be proposing - only offer it while no matter instance exists at all.
    if (!commissionable && tools.findInstance(options, adapterName)?._existing) {
        options.log.debug(`Matter node at ${ip} is already commissioned, skipping`);
        return callback(null, false, ip);
    }

    options.log.debug(`Matter device detected at ${ip} (${commissionable ? 'commissionable' : 'operational'})`);

    // The matter adapter is the controller for the whole fabric and keeps no device list in
    // `native` - one instance covers every node, pairing happens inside the adapter.
    callback(null, tools.proposeSharedInstance(adapterName, describe(device, ip), options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
