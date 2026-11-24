import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'opendtu';

// OpenDTU (tbnobody/OpenDTU, src/NetworkSettings.cpp, handleMDNS()) announces `_opendtu._tcp`
// on port 80 with a `git_hash` TXT entry (the firmware version, e.g. v26.11.11) - but only when
// mDNS is switched on in its network settings (off by default).
const OPENDTU_SERVICE = '_opendtu._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, OPENDTU_SERVICE)) {
        return callback(null, false, ip);
    }

    // One instance per OpenDTU, addressed by `native.webUIServer` (an IP address or a host name)
    const name = tools.mdnsName(device) || 'OpenDTU';
    const hostname = `${name}.local`.toLowerCase();
    if (
        tools.findInstance(options, adapterName, obj => {
            const server = String(obj.native?.webUIServer || '').toLowerCase();
            return server === ip || server === name.toLowerCase() || server === hostname;
        })
    ) {
        return callback(null, false, ip);
    }

    const firmware = tools.mdnsTxt(device).git_hash;
    options.log.debug(`OpenDTU detected at ${ip}${firmware ? ` (${firmware})` : ''}`);
    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: { name: adapterName },
        // The password stays empty: OpenDTU allows read-only access without it by default, and
        // it is entered in the adapter settings if read-only access is switched off
        native: { webUIScheme: 'http', webUIServer: ip, webUIPort: 80 },
        comment: { add: [firmware ? `${name} ${firmware}` : name, ip] },
    });
    callback(null, true, ip);
}

export const type = ['mdns'];
export const timeout = 1500;
