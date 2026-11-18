import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'miele-local';

// Miele@home appliances (XKM 3100 W / XKM 3000 Z modules and appliances with built-in WiFi)
// announce this service; the adapter's own discovery browses the same type.
const MIELE_SERVICE = '_mieleathome._tcp';

// The host name of an appliance is `Miele-<EUI-64 of its MAC>.local`, e.g. `Miele-001D63FFFE3F0B30.local`
const reMieleHost = /^Miele-[0-9A-F]{12,16}\.local\.?$/i;

/**
 * The address the appliance announced for itself, or `null` when this device is not the appliance.
 *
 * An mDNS reflector (UniFi gateways, Avahi with `enable-reflector`) repeats the answers of the
 * appliances into other networks from its own address. The discovery core files those under the
 * reflector, so the service alone would turn the router into a Miele appliance. The A record tells
 * them apart: an appliance announces its own address, a reflector repeats foreign ones.
 */
function ownMieleHost(ip: string, device: DiscoveryDevice): string | null {
    const names = tools.mdnsValues(device, 'A', 'name').filter(name => reMieleHost.test(name));
    const addresses = tools.mdnsValues(device, 'A', 'data');
    if (!names.length || !addresses.length || addresses.some(address => address !== ip)) {
        return null;
    }
    return names[0].replace(/\.local\.?$/i, '');
}

function listsIp(instance: ProtocolData, ip: string): boolean {
    const devices = instance.native?.devices;
    return (
        Array.isArray(devices) &&
        devices.some((entry: ProtocolData): boolean => (typeof entry === 'string' ? entry : entry?.ip) === ip)
    );
}

/**
 * One instance serves every appliance of a household. Each find is written to `native.devices`
 * (the "manual device IPs" table), which the adapter uses in addition to its own mDNS discovery.
 * Nothing else is pre-filled: the GroupKey comes from the login in the instance settings, and
 * control stays switched off (`allowControl: false` is the adapter default).
 */
function addInstance(ip: string, name: string, options: DetectOptions): boolean {
    const before = options.newInstances.length;
    let instance = tools.pendingProposal(options, adapterName) || tools.findInstance(options, adapterName);

    if (instance?._existing && (instance.native?.autoDiscover !== false || listsIp(instance, ip))) {
        // the configured instance finds this appliance itself or already knows it
        return false;
    }

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
            },
            native: {
                devices: [],
            },
            comment: {
                add: [],
            },
        };
        options.newInstances.push(instance);
    } else if (instance._existing && !options.newInstances.includes(instance)) {
        // extending an instance that is already configured
        options.newInstances.push(instance);
    }

    if (listsIp(instance, ip)) {
        return before !== options.newInstances.length;
    }

    instance.native ||= {};
    instance.native.devices ||= [];
    (instance.native.devices as ProtocolData[]).push({ ip });

    instance.comment ||= {};
    if (instance.comment.ack) {
        instance.comment.ack = false;
    }
    const list: string[] = instance.comment.add || (instance.comment.extended ||= []);
    list.push(`${name} (${ip})`);

    return before !== options.newInstances.length;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, MIELE_SERVICE)) {
        return callback(null, false, ip);
    }

    const name = ownMieleHost(ip, device);
    if (!name) {
        options.log.debug(`Miele@home service seen at ${ip}, but not announced by the appliance itself - ignored`);
        return callback(null, false, ip);
    }

    options.log.debug(`Miele@home appliance detected at ${ip} (${name})`);
    callback(null, addInstance(ip, name, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
