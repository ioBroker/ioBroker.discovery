import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'sony-bravia';

/**
 * `lib/bravia.js` of the adapter searches for exactly this service type and then looks it up
 * a second time in the `serviceList` of the device description before it accepts a device -
 * a guard its own comment explains with a Philips Hue bridge that answered the search.
 */
const IRCC_SERVICE = 'urn:schemas-sony-com:service:IRCC:1';

/**
 * True if this UPnP answer belongs to a Sony device with the IRCC remote control service.
 *
 * The discovery here searches `ssdp:all`, so the service type reaches us either in the
 * header set of that one service or - for the other services of the same device - only in
 * the description document the method fetched into `_location`.
 *
 * @param upnp one header set of the device
 */
export function isBraviaAnswer(upnp: ProtocolData): boolean {
    if (!upnp) {
        return false;
    }
    if ([upnp.ST, upnp.NT, upnp.USN].some(value => typeof value === 'string' && value.includes(IRCC_SERVICE))) {
        return true;
    }
    return typeof upnp._location === 'string' && upnp._location.includes(IRCC_SERVICE);
}

/**
 * Read a tag out of a UPnP device description.
 *
 * @param xml the description document
 * @param tag name of the tag
 */
export function descriptionTag(xml: string | undefined, tag: string): string | undefined {
    if (typeof xml !== 'string') {
        return undefined;
    }
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i').exec(xml);
    return match ? match[1].trim() : undefined;
}

function addInstance(ip: string, name: string | undefined, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.ip === ip);

    if (instance) {
        options.log.info(`sony-bravia adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Sony ${name || ip}`,
        },
        native: {
            ip,
            psk: '',
        },
        comment: {
            add: [`Sony Bravia ${name || ''} (${ip})`.replace('  ', ' ')],
            // Without the pre-shared key from the TV's own network menu the adapter does not start
            inputs: [{ name: 'native.psk', def: '', type: 'password', title: 'Pre-Shared Key of the TV' }],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // ssdp:all makes a TV answer once per service, so stop at the first hit instead of
    // running into addInstance() again for every remaining header set
    const answer = (device._upnp as ProtocolData[]).find(isBraviaAnswer);

    if (!answer) {
        return callback(null, false, ip);
    }

    options.log.debug(`Sony Bravia detected at: ${ip}`);
    const name = descriptionTag(answer._location, 'friendlyName') || descriptionTag(answer._location, 'modelName');
    callback(null, addInstance(ip, name, options), ip);
}

export const type = ['upnp'];
export const timeout = 100;
