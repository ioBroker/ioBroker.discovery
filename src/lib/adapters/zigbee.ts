import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'zigbee';

/**
 * USB fingerprints of Zigbee coordinators, taken from `USB_FINGERPRINTS` in
 * zigbee-herdsman's `src/adapter/adapterDiscovery.ts` - the library the zigbee adapter
 * itself drives its coordinator with. `family` is what the adapter stores as
 * `native.adapterType`, so a match also pre-selects the right driver.
 */
interface Fingerprint {
    family: 'deconz' | 'ember' | 'zstack' | 'zboss' | 'zigate';
    vid: string;
    pid: string;
    manufacturer?: string;
    pathRegex?: RegExp;
}

const FINGERPRINTS: Fingerprint[] = [
    { family: 'deconz', vid: '1cf1', pid: '0030', manufacturer: 'dresden elektronik', pathRegex: /conbee/i },
    { family: 'deconz', vid: '0403', pid: '6015', manufacturer: 'dresden elektronik', pathRegex: /conbee/i },
    { family: 'ember', vid: '10c4', pid: 'ea60', manufacturer: 'Nabu Casa', pathRegex: /nabu_casa_skyconnect/i },
    { family: 'ember', vid: '303a', pid: '4001', manufacturer: 'Nabu Casa', pathRegex: /nabu_casa_zbt-2/i },
    { family: 'ember', vid: '303a', pid: '831a', manufacturer: 'Nabu Casa', pathRegex: /nabu_casa_zbt-2/i },
    { family: 'ember', vid: '10c4', pid: 'ea60', manufacturer: 'SMLIGHT', pathRegex: /slzb-0(6m|7_|7mg24)/i },
    { family: 'ember', vid: '1a86', pid: '55d4', manufacturer: 'ITEAD', pathRegex: /sonoff.*plus/i },
    { family: 'ember', vid: '10c4', pid: 'ea60', manufacturer: 'ITEAD', pathRegex: /sonoff.*plus_v2_/i },
    {
        family: 'ember',
        vid: '10c4',
        pid: 'ea60',
        manufacturer: 'SONOFF',
        pathRegex: /sonoff.*(max|plus.*mg24|lite.*mg21)/i,
    },
    { family: 'zstack', vid: '0403', pid: '6015', manufacturer: 'Electrolama', pathRegex: /electrolama/i },
    { family: 'zstack', vid: '10c4', pid: 'ea60', manufacturer: 'Silicon Labs', pathRegex: /slae\.sh_cc2652rb/i },
    { family: 'zstack', vid: '10c4', pid: 'ea60', manufacturer: 'SONOFF', pathRegex: /sonoff.*plus.*cc2674p10/i },
    { family: 'zstack', vid: '10c4', pid: 'ea60', manufacturer: 'ITEAD', pathRegex: /sonoff.*plus/i },
    { family: 'zstack', vid: '10c4', pid: 'ea60', manufacturer: 'SMLIGHT', pathRegex: /slzb-0(7p7|6p7|6p10)/i },
    { family: 'zstack', vid: '0451', pid: '16c8', manufacturer: 'Texas Instruments', pathRegex: /cc2538/i },
    { family: 'zstack', vid: '0451', pid: '16a8', manufacturer: 'Texas Instruments', pathRegex: /cc2531/i },
    { family: 'zstack', vid: '0451', pid: 'bef3', manufacturer: 'Texas Instruments', pathRegex: /texas_instruments/i },
    { family: 'zstack', vid: '10c4', pid: 'ea60', pathRegex: /tubeszb/i },
    { family: 'zstack', vid: '1a86', pid: '7523', pathRegex: /tubeszb|zigstar/i },
    { family: 'zboss', vid: '2fe3', pid: '0100', manufacturer: 'ZEPHYR', pathRegex: /zephyr/i },
    { family: 'zigate', vid: '067b', pid: '2303', manufacturer: 'zigate', pathRegex: /zigate/i },
    { family: 'zigate', vid: '10c4', pid: 'ea60', manufacturer: 'zigate', pathRegex: /zigate/i },
    { family: 'zigate', vid: '0403', pid: '6015', pathRegex: /zigate/i },
];

/**
 * Vendor/product pairs of plain USB-to-serial bridges. Half the world's serial gadgets sit
 * behind one of these chips, so a bare vid/pid match on them proves nothing - the
 * manufacturer or the device path has to corroborate it. zigbee-herdsman flags the same
 * problem for `10c4:ea60`.
 */
const GENERIC_BRIDGES = new Set(['10c4:ea60', '1a86:7523', '1a86:55d4', '0403:6015', '067b:2303']);

export interface CoordinatorMatch {
    family: Fingerprint['family'];
    /** how much corroborated the match: 1 = vid/pid only, 2 = plus manufacturer or path */
    score: number;
}

/**
 * Identify a Zigbee coordinator from the USB descriptor of a serial port.
 *
 * @param port the `_data` the serial method attached to the device
 */
export function matchCoordinator(port: ProtocolData): CoordinatorMatch | null {
    const vid = typeof port?.vendorId === 'string' ? port.vendorId.toLowerCase() : '';
    const pid = typeof port?.productId === 'string' ? port.productId.toLowerCase() : '';
    if (!vid || !pid) {
        return null;
    }

    const manufacturer = typeof port.manufacturer === 'string' ? port.manufacturer : '';
    // the vendor name often only shows up in the by-id path, not in `manufacturer`
    const haystack = [port.path, port.pnpId, port.friendlyName, manufacturer].filter(Boolean).join(' ');

    let best: CoordinatorMatch | null = null;
    for (const print of FINGERPRINTS) {
        if (print.vid !== vid || print.pid !== pid) {
            continue;
        }

        let score = 1;
        if (print.manufacturer && manufacturer.toLowerCase().startsWith(print.manufacturer.toLowerCase())) {
            score += 1;
        }
        if (print.pathRegex && print.pathRegex.test(haystack)) {
            score += 1;
        }

        if (!best || score > best.score) {
            best = { family: print.family, score };
        }
    }

    if (!best) {
        return null;
    }
    // a generic bridge chip on its own is not evidence of anything
    return GENERIC_BRIDGES.has(`${vid}:${pid}`) && best.score < 2 ? null : best;
}

function addInstance(port: string, match: CoordinatorMatch, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.port === port);

    if (instance) {
        options.log.info(`Zigbee adapter already present for ${port}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Zigbee coordinator (${port})`,
        },
        native: {
            port,
            // the driver family - the one setting users most often get wrong
            adapterType: match.family,
        },
        comment: {
            add: [`Zigbee coordinator, ${match.family}`, port],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // No probe needed: the USB descriptor the serial method delivers is the whole evidence,
    // and opening a coordinator that another adapter already holds would be rude.
    const match = matchCoordinator(device?._data);
    if (!match) {
        return callback(null, false, ip);
    }

    options.log.debug(`Zigbee coordinator (${match.family}) detected on ${ip}`);
    callback(null, addInstance(ip, match, options), ip);
}

export const type = 'serial';
export const timeout = 1000;
