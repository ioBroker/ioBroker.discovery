import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'androidtv';

// Android TV / Google TV devices (NVIDIA SHIELD, Chromecast with Google TV, TVs from Sony, Philips, TCL, ...) run
// the "Android TV Remote Service", the server behind the Google TV app's remote. It announces itself as
// `_androidtvremote2._tcp` on port 6466 (pairing runs on 6467); the instance name is the device name the user set,
// e.g. `SHIELD` or `Wohnzimmer`. Fire TV has no such service - it is found by `firetv.ts` instead.
const REMOTE_SERVICE = '_androidtvremote2._tcp';
const REMOTE_PORT = 6466;

// The announcement alone is trusted only after the remote port answered: a device that is switched off can still be
// in another host's mDNS cache. A TCP connect on the LAN takes a few milliseconds.
const PROBE_TIMEOUT = 1000;

/**
 * An mDNS reflector (UniFi gateways, Avahi with `enable-reflector`) repeats the answers of other hosts from its own
 * address, A records included. A device only ever names its own address. Proposing the reflector's address would
 * create a device that never connects, so nothing is proposed then.
 */
function namesForeignAddress(ip: string, device: DiscoveryDevice): boolean {
    return tools.mdnsValues(device, 'A', 'data').some(address => address !== ip);
}

function isConfigured(instance: { native?: ProtocolData }, ip: string): boolean {
    const devices = instance?.native?.devices;
    return Array.isArray(devices) && devices.some((entry: ProtocolData) => entry?.host === ip);
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, REMOTE_SERVICE) || namesForeignAddress(ip, device)) {
        return callback(null, false, ip);
    }

    // One instance handles every device. When one is configured already, new devices are added in its "Devices" tab
    // (Add device + pairing code), which discovery cannot do - so nothing is proposed then.
    const existing = options.existingInstances.find(instance => instance.common?.name === adapterName);
    if (existing) {
        if (!isConfigured(existing, ip)) {
            options.log.debug(`Android TV at ${ip} not yet configured in ${existing._id} - add it in its Devices tab`);
        }
        return callback(null, false, ip);
    }

    tools.testPort(ip, REMOTE_PORT, PROBE_TIMEOUT, (error, found) => {
        if (error || !found) {
            return callback(null, false, ip);
        }

        const name = tools.mdnsName(device) || ip;
        const before = options.newInstances.length;
        let instance = tools.pendingProposal(options, adapterName);
        if (!instance) {
            instance = {
                _id: tools.getNextInstanceID(adapterName, options),
                common: { name: adapterName },
                native: { devices: [] },
                comment: { add: [] },
            };
            options.newInstances.push(instance);
        }

        instance.native.devices ||= [];
        if (!isConfigured(instance, ip)) {
            // DEPENDENCY on the androidtv adapter (native.devices, checked with 0.3.0). The device type "standard"
            // (`connection: 'remote'`) needs nothing but a pairing code, which the user enters in the Devices tab;
            // ADB and Wake-on-LAN stay off because they need settings on the device first.
            (instance.native.devices as ProtocolData[]).push({
                enabled: true,
                name,
                host: ip,
                connection: 'remote',
                enableIme: true,
                adbPort: 5555,
                wolMac: '',
                wolBroadcast: '',
            });
            (instance.comment!.add as string[]).push(`${name} (${ip})`);
        }
        options.log.debug(`Android TV remote service found: ${name} (${ip})`);

        callback(null, before !== options.newInstances.length, ip);
    });
}

export const type = ['mdns'];
// main.ts arms its watchdog with this value before calling detect(), so it must outlast the probe
export const timeout = PROBE_TIMEOUT + 500;
