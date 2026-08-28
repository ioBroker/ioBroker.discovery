import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'esphome';

// Read out of @2colors/esphome-native-api, the library the adapter uses to talk to devices
const ESPHOME_SERVICE = '_esphomelib._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, ESPHOME_SERVICE)) {
        return callback(null, false, ip);
    }

    const txt = tools.mdnsTxt(device);
    const name = tools.mdnsName(device);
    // The TXT record carries the ESPHome version and the board; both help the user tell
    // several identical nodes apart.
    const details = [name || ip, txt.version && `ESPHome ${txt.version}`, txt.board].filter(Boolean).join(', ');

    options.log.debug(`ESPHome device detected at ${ip}`);
    // The adapter has `autodiscovery` switched on by default and keeps no device list of its
    // own in `native`, so one instance is enough for every node.
    callback(null, tools.proposeSharedInstance(adapterName, `${details} (${ip})`, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
