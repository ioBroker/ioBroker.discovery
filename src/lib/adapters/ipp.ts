import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'ipp';
const IPP_SERVICES = ['_ipp._tcp', '_ipps._tcp'] as const;

function recordPairs(device: DiscoveryDevice, record: string): Array<[unknown, unknown]> {
    const entry = device._mdns?.[record];
    if (!entry || typeof entry !== 'object') {
        return [];
    }

    const pairs: Array<[unknown, unknown]> = [[entry.name, entry.data]];
    for (const [namesKey, dataKey] of [
        ['namex', 'datax'],
        ['names', 'dataa'],
    ]) {
        const names = entry[namesKey];
        const data = entry[dataKey];
        if (!Array.isArray(names) || !Array.isArray(data)) {
            continue;
        }
        for (let index = 0; index < Math.min(names.length, data.length); index++) {
            pairs.push([names[index], data[index]]);
        }
    }
    return pairs;
}

function normalizeName(value: string): string {
    return value.trim().replace(/\.$/, '').toLowerCase();
}

function isServiceType(value: unknown, service: string): boolean {
    if (typeof value !== 'string') {
        return false;
    }
    const name = normalizeName(value);
    return name === service || name === `${service}.local`;
}

function serviceInstance(value: unknown, service: string): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const name = normalizeName(value);
    for (const suffix of [`.${service}.local`, `.${service}`]) {
        if (name.endsWith(suffix) && name.length > suffix.length) {
            return name;
        }
    }
    return null;
}

function hasSrvTarget(value: unknown): boolean {
    if (typeof value === 'string') {
        return value.trim() !== '' && value.trim() !== '.';
    }
    if (!value || typeof value !== 'object') {
        return false;
    }
    const data = value as { target?: unknown; host?: unknown };
    return [data.target, data.host].some(
        target => typeof target === 'string' && target.trim() !== '' && target.trim() !== '.',
    );
}

function txtStrings(value: unknown): string[] {
    if (Buffer.isBuffer(value)) {
        const strings: string[] = [];
        let offset = 0;
        while (offset < value.length) {
            const length = value[offset++];
            if (offset + length > value.length) {
                break;
            }
            strings.push(value.toString('utf8', offset, offset + length));
            offset += length;
        }
        return strings;
    }
    if (typeof value === 'string') {
        return [value];
    }
    return Array.isArray(value) ? value.flatMap(txtStrings) : [];
}

function hasPrinterResourcePath(device: DiscoveryDevice, instance: string): boolean {
    return recordPairs(device, 'TXT').some(([name, data]) => {
        if (typeof name !== 'string' || normalizeName(name) !== instance) {
            return false;
        }
        return txtStrings(data).some(value => {
            const separator = value.indexOf('=');
            return (
                separator > 0 &&
                value.slice(0, separator).toLowerCase() === 'rp' &&
                value.slice(separator + 1).trim() !== ''
            );
        });
    });
}

function hasIppService(device: DiscoveryDevice): boolean {
    for (const service of IPP_SERVICES) {
        const instances = recordPairs(device, 'PTR')
            .filter(([name]) => isServiceType(name, service))
            .map(([, data]) => serviceInstance(data, service))
            .filter((value): value is string => value !== null);
        for (const instance of instances) {
            const hasMatchingSrv = recordPairs(device, 'SRV').some(
                ([name, data]) => typeof name === 'string' && normalizeName(name) === instance && hasSrvTarget(data),
            );
            if (hasMatchingSrv && hasPrinterResourcePath(device, instance)) {
                return true;
            }
        }
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!hasIppService(device)) {
        return callback(null, false, ip);
    }

    const label = `${tools.mdnsName(device) || 'IPP printer'} (${ip})`;
    options.log.debug(`IPP printer service detected at ${ip}`);
    callback(null, tools.proposeSharedInstance(adapterName, label, options), ip);
}

export const type = ['mdns'];
export const timeout = 1500;
