import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'bambulab';

const SERVICE_TYPE = 'urn:bambulab-com:device:3dprinter:1';
/** The adapter talks MQTT over TLS to the printer, io-package default */
const MQTT_PORT = 8883;

/**
 * The `printerModel` select of the adapter offers four series. The announcement carries the
 * project name of the mainboard (`DevModel.bambu.com: C12` on a P1S), and the codes are the
 * ones pybambu maps in `get_printer_type()`: C11 = P1P, C12 = P1S, N1 = A1 mini, N2S = A1.
 * X1 printers name themselves outright (`3DPrinter-X1-Carbon`).
 */
const MODEL_SERIES: [RegExp, string][] = [
    [/X1|X2/i, 'X1-Series'],
    [/H2/i, 'H2D-Series'],
    [/^C1[12]$|P1/i, 'P1-Series'],
    [/^N1$|^N2S$|A1/i, 'A1-Series'],
];

/**
 * Pick the series the adapter's dropdown expects, or `null` when the code is unknown to us -
 * then the user has to choose, which is better than silently picking the wrong protocol
 * dialect.
 *
 * @param devModel value of the `DevModel.bambu.com` header
 */
export function printerSeries(devModel: string | undefined): string | null {
    if (!devModel) {
        return null;
    }
    for (const [pattern, series] of MODEL_SERIES) {
        if (pattern.test(devModel)) {
            return series;
        }
    }
    return null;
}

/**
 * Find the printer announcement on a device, whatever way it arrived.
 *
 * `methods/bambulab.ts` puts the headers in `_bambulab`; should a firmware really announce on
 * 1900 as some reports say, the very same headers arrive through `methods/upnp.ts` instead
 * and sit in the `_upnp` list. Header names are upper-cased in the first case and kept as
 * sent in the second, so both spellings are looked up.
 *
 * @param device the device as delivered by one of the two methods
 */
export function bambuHeaders(device: DiscoveryDevice | null): Record<string, string> | null {
    const candidates: ProtocolData[] = [];
    if (device?._bambulab) {
        candidates.push(device._bambulab);
    }
    if (Array.isArray(device?._upnp)) {
        candidates.push(...device._upnp);
    }

    for (const headers of candidates) {
        if (!headers) {
            continue;
        }
        const serviceType = headers.NT || headers.ST || headers.nt || headers.st;
        if (typeof serviceType === 'string' && serviceType.includes(SERVICE_TYPE)) {
            return headers;
        }
    }
    return null;
}

/**
 * Read a header without caring how the method spelled it.
 *
 * @param headers the announcement
 * @param name the header name as the printer sends it
 */
function header(headers: Record<string, string>, name: string): string | undefined {
    return headers[name.toUpperCase()] ?? headers[name];
}

function addInstance(ip: string, headers: Record<string, string>, options: DetectOptions): boolean {
    const serial = header(headers, 'USN') || '';
    const instance = tools.findInstance(
        options,
        adapterName,
        obj => obj.native.host === ip || (!!serial && obj.native.serial === serial),
    );

    if (instance) {
        options.log.info(`bambulab adapter already present for ${ip}`);
        return false;
    }

    const name = header(headers, 'DevName.bambu.com');
    const series = printerSeries(header(headers, 'DevModel.bambu.com'));

    const native: ProtocolData = {
        host: ip,
        port: MQTT_PORT,
        // the announcement carries the serial the adapter authenticates with
        serial,
    };
    if (series) {
        native.printerModel = series;
    }

    const comment: ProtocolData = {
        add: [`Bambu Lab ${name || 'printer'} (${ip})`],
        // The access code lives on the printer's own display, it cannot be discovered
        inputs: [{ name: 'native.Password', def: '', type: 'password', title: 'Access code (LAN mode)' }],
    };
    if (!series) {
        comment.inputs.push({
            name: 'native.printerModel',
            def: 'P1-Series',
            type: 'text',
            title: 'Printer model (A1-, H2D-, P1- or X1-Series)',
        });
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Bambu Lab ${name || ip}`,
        },
        native,
        comment,
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const headers = bambuHeaders(device);

    if (!headers) {
        return callback(null, false, ip);
    }

    options.log.debug(`Bambu Lab printer detected at ${ip}`);
    callback(null, addInstance(ip, headers, options), ip);
}

export const type = ['bambulab', 'upnp'];
export const timeout = 100;
