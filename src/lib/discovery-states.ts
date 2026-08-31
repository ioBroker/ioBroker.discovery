/**
 * The decisions behind the two things a scan does besides writing `system.discovery`: it
 * mirrors what it found into this instance's own object tree, and it can repeat itself on a
 * timer.
 *
 * They live here rather than in `main.ts` because `main.ts` replaces its own `module.exports`
 * for compact mode and therefore cannot export anything a test could reach.
 */

import type { DiscoveryDevice } from './types';

/** How long after start-up the first scheduled scan runs - the host is busy right at boot */
export const FIRST_AUTO_DETECT_DELAY = 120000;
/** A scan costs minutes of network traffic, so anything below this is refused */
export const MIN_AUTO_DETECT_MINUTES = 5;
/** The `once` pseudo device stands for this host itself and is not a find */
const NOT_A_DEVICE = '0.0.0.0';

/**
 * Turn an address into something that may stand in an ioBroker object id.
 *
 * An IPv4 address carries dots and a serial port carries slashes or backslashes - none of
 * them are allowed in an id.
 *
 * @param address IP address or serial port name
 */
export function toObjectId(address: string): string {
    return String(address).replace(/[^A-Za-z0-9_-]/g, '_');
}

/** True for a device that belongs in the object tree */
export function isRealDevice(device: DiscoveryDevice): boolean {
    return !!device?._addr && device._addr !== NOT_A_DEVICE;
}

/** One state below a device channel */
export interface DeviceStateRow {
    key: string;
    label: string;
    type: 'string' | 'number';
    role: string;
    value: string | number;
}

/**
 * The name of the channel of one device - the speaking name plus the address it was found at,
 * because a name alone is not unique on a network.
 *
 * @param device a device of the last scan
 */
export function deviceChannelName(device: DiscoveryDevice): string {
    const name = device._name || device._addr;
    return name === device._addr ? device._addr : `${name} (${device._addr})`;
}

/**
 * The states that describe one device.
 *
 * @param device a device of the last scan
 * @param now timestamp of the scan
 */
export function deviceStateRows(device: DiscoveryDevice, now: number): DeviceStateRow[] {
    return [
        { key: 'address', label: 'Address', type: 'string', role: 'info.ip', value: device._addr },
        { key: 'name', label: 'Name', type: 'string', role: 'info.name', value: device._name || device._addr },
        { key: 'type', label: 'Device type', type: 'string', role: 'text', value: device._type || 'ip' },
        { key: 'source', label: 'Found by', type: 'string', role: 'text', value: device._source || '' },
        {
            key: 'suggested',
            label: 'Adapters that recognised it',
            type: 'string',
            role: 'text',
            // sorted so that two scans of an unchanged network write the same value
            value: [...(device._detected || [])].sort().join(', '),
        },
        { key: 'lastSeen', label: 'Last seen', type: 'number', role: 'value.time', value: now },
    ];
}

/**
 * Which device channels the tree should hold after this scan, keyed by object id.
 *
 * @param devices what the scan found
 */
export function wantedChannels(devices: DiscoveryDevice[]): Map<string, DiscoveryDevice> {
    const wanted = new Map<string, DiscoveryDevice>();
    for (const device of devices || []) {
        if (isRealDevice(device)) {
            wanted.set(toObjectId(device._addr), device);
        }
    }
    return wanted;
}

/**
 * The device channels that are in the tree but not in this scan.
 *
 * The tree shows the *last* scan and not a history, so a device that did not turn up again is
 * removed rather than left behind claiming to be there.
 *
 * @param objectIds every object id of this instance
 * @param namespace the instance namespace, e.g. `discovery.0`
 * @param wanted the channels this scan wants, as returned by {@link wantedChannels}
 */
export function staleChannels(objectIds: string[], namespace: string, wanted: Map<string, unknown>): string[] {
    const prefix = `${namespace}.devices.`;
    const stale = new Set<string>();

    for (const id of objectIds) {
        if (!id.startsWith(prefix)) {
            continue;
        }
        const channel = id.substring(prefix.length).split('.')[0];
        if (channel && !wanted.has(channel)) {
            stale.add(channel);
        }
    }
    return [...stale];
}

/** The part of the configuration the scheduled scan reads */
export interface AutoDetectConfig {
    autoDetect?: boolean;
    autoDetectInterval?: number | string;
    autoDetectMethods?: unknown;
}

/**
 * The methods a scan runs when nobody picked any.
 *
 * The four that listen or send a few packets and are over in seconds. The ones left out cost
 * more than they bring on a timer: `serial` opens every serial port of the host and can
 * disturb whatever is talking on it, `tr064` only has something to say on a FRITZ!Box, and
 * `speedwire` only where an SMA inverter lives. They are one click away in the settings.
 */
export const DEFAULT_AUTO_DETECT_METHODS = ['mdns', 'ping', 'udp', 'upnp'];

/**
 * Which methods a scheduled scan should run.
 *
 * Never empty: a configuration without a selection - an instance from before the field
 * existed, or a list the user emptied - falls back to {@link DEFAULT_AUTO_DETECT_METHODS}.
 * The admin discovery dialog is not affected, it passes its own list straight to `browse()`.
 *
 * @param config the instance configuration
 */
export function autoDetectMethods(config: AutoDetectConfig): string[] {
    const selected = config?.autoDetectMethods;
    if (!Array.isArray(selected)) {
        return [...DEFAULT_AUTO_DETECT_METHODS];
    }
    const names = selected.filter((name): name is string => typeof name === 'string' && !!name);
    return names.length ? names : [...DEFAULT_AUTO_DETECT_METHODS];
}

/**
 * Minutes between two scheduled scans, with the lower bound applied.
 *
 * The value can arrive as a string from an older instance configuration, and an empty or
 * unreadable one falls back to an hour.
 *
 * @param config the instance configuration
 */
export function autoDetectMinutes(config: AutoDetectConfig): number {
    const minutes = parseInt(config?.autoDetectInterval as string, 10);
    if (!Number.isFinite(minutes)) {
        // nothing usable was configured - an instance from before this field existed
        return 60;
    }
    // a number was given, so it is honoured as far as the lower bound allows
    return Math.max(MIN_AUTO_DETECT_MINUTES, minutes);
}
