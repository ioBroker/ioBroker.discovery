import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'hyperion-connector';

/** `lib/network.js` of the adapter: `serviceType = 'urn:hyperion-project.org:device:basic:1'` */
const HYPERION_SERVICE = 'urn:hyperion-project.org:device:basic:1';
/** Port of the Hyperion web server, the default of the adapter's device table */
const DEFAULT_PORT = 8090;

/**
 * True if this UPnP answer comes from a Hyperion server.
 *
 * @param upnp one header set of the device
 */
export function isHyperionAnswer(upnp: ProtocolData): boolean {
    if (!upnp) {
        return false;
    }
    return [upnp.ST, upnp.NT, upnp.USN].some(value => typeof value === 'string' && value.includes(HYPERION_SERVICE));
}

/**
 * The device table of the adapter stores the UDN without the `uuid:` prefix - `controller.js`
 * strips it on both paths it can take, so an entry that still carries it would never match
 * the server once it is found again.
 *
 * @param usn the `USN` header, `uuid:<udn>::<service type>`
 */
export function hyperionUdn(usn: string | undefined): string {
    if (typeof usn !== 'string') {
        return '';
    }
    return usn.split('::')[0].replace('uuid:', '').trim();
}

/**
 * Take protocol, host and port out of the `LOCATION` header.
 *
 * @param location the `LOCATION` header of the answer
 * @param fallbackIp address the answer came from
 */
export function hyperionEndpoint(
    location: string | undefined,
    fallbackIp: string,
): { protocol: string; ip: string; port: number } {
    try {
        const url = new URL(location!);
        return {
            protocol: url.protocol,
            ip: url.hostname || fallbackIp,
            port: parseInt(url.port, 10) || DEFAULT_PORT,
        };
    } catch {
        return { protocol: 'http:', ip: fallbackIp, port: DEFAULT_PORT };
    }
}

/**
 * Read a tag out of the UPnP device description.
 *
 * @param xml the description document
 * @param tag name of the tag
 */
function descriptionTag(xml: string | undefined, tag: string): string | undefined {
    if (typeof xml !== 'string') {
        return undefined;
    }
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i').exec(xml);
    return match ? match[1].trim() : undefined;
}

function addInstance(ip: string, upnp: ProtocolData, options: DetectOptions): boolean {
    const udn = hyperionUdn(upnp.USN);
    const endpoint = hyperionEndpoint(upnp.LOCATION, ip);
    const name = descriptionTag(upnp._location, 'friendlyName') || `Hyperion ${endpoint.ip}`;

    // One instance drives every server, so all finds of a scan are collected in one proposal.
    // The lookup order matters: tools.findInstance() looks at the configured instances first
    // and returns a fresh copy every time, so a proposal of this scan has to win.
    let instance = options.newInstances.find(entry => entry.common?.name === adapterName) || null;

    if (!instance) {
        instance = tools.findInstance(options, adapterName) || {
            _id: tools.getNextInstanceID(adapterName, options),
            common: { name: adapterName },
            native: { devices: [] },
            comment: { add: [] },
        };
    }

    instance.native.devices ||= [];
    const devices = instance.native.devices as ProtocolData[];

    if (devices.some(entry => (udn && entry.UDN === udn) || entry.ip === endpoint.ip)) {
        options.log.info(`hyperion-connector already knows the server at ${endpoint.ip}`);
        return false;
    }

    // the shape of one row of the adapter's device table, `admin/jsonConfig.json`
    devices.push({
        UDN: udn,
        name,
        protocol: endpoint.protocol,
        ip: endpoint.ip,
        port: endpoint.port,
        token: '',
        enabled: true,
    });

    // only now is there something to show - either a fresh proposal or the configured
    // instance offered again with the new server added to it
    if (!options.newInstances.includes(instance)) {
        options.newInstances.push(instance);
    }

    instance.comment ||= {};
    if (instance.comment.ack) {
        instance.comment.ack = false;
    }
    const list: string[] = instance.comment.add || (instance.comment.extended ||= []);
    const label = `Hyperion server ${name} (${endpoint.ip}:${endpoint.port})`;
    if (!list.includes(label)) {
        list.push(label);
    }

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const answer = (device._upnp as ProtocolData[]).find(isHyperionAnswer);

    if (!answer) {
        return callback(null, false, ip);
    }

    options.log.debug(`Hyperion server detected at: ${ip}`);
    callback(null, addInstance(ip, answer, options), ip);
}

export const type = ['upnp'];
export const timeout = 100;
