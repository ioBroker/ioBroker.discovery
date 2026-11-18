import * as http from 'node:http';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'alpha2';

// The base station of the Möhlenhoff Alpha 2 floor heating control serves its whole
// configuration without a login as /data/static.xml on port 80 - the adapter reads the same
// file. Nothing else is requested, and changes.xml (the write interface) is never touched.
const ALPHA2_PORT = 80;
const STATIC_PATH = '/data/static.xml';
const PROBE_TIMEOUT = 2000;
// The web server of the base station handles a single connection at a time. When a second one
// comes in - the adapter polling, the web UI, another detection module probing port 80 - one of
// them is dropped half way through the answer. Such a probe is repeated once after a pause,
// never in parallel.
const ATTEMPTS = 2;
const RETRY_DELAY = 500;
// static.xml of a base station with eight heating areas is about 15 kB
const MAX_BODY = 256 * 1024;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than everything the probe may take - otherwise the watchdog wins the race.
const DETECT_TIMEOUT = ATTEMPTS * PROBE_TIMEOUT + (ATTEMPTS - 1) * RETRY_DELAY + 300;

const MAX_TEXT = 64;

/** What a base station tells about itself in the first `<Device>` of static.xml */
export interface Alpha2BaseStation {
    /** `<ID>`, e.g. `EZR012345` */
    id: string;
    /** `<TYPE>`, `EZRCTRL1` for the base station */
    type: string;
    /** `<NAME>`, the ID unless somebody renamed the base station */
    name?: string;
    /** `<VERS_SW_STM>`, the firmware of the controller */
    firmware?: string;
}

function decodeText(raw: string | undefined): string | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const text = raw
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
    return text ? text.substring(0, MAX_TEXT) : undefined;
}

function readTag(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return decodeText(match?.[1]);
}

/**
 * Read the description of the base station out of a /data/static.xml answer.
 *
 * Only the first `<Device>` is looked at, and only the fields that identify the base station -
 * the file carries much more, among it the credentials of the vendor's cloud service, and none
 * of that may end up in a proposal.
 *
 * @param body the raw answer
 */
export function parseStaticXml(body: string | null | undefined): Alpha2BaseStation | null {
    if (!body || typeof body !== 'string') {
        return null;
    }
    const start = body.search(/<Devices>\s*<Device>/);
    if (start === -1) {
        return null;
    }
    let device = body.substring(start);
    const end = device.indexOf('</Device>');
    if (end !== -1) {
        device = device.substring(0, end);
    }

    // `<TYPE>EZRCTRL…` together with an `<ID>` is what tells a base station apart from any
    // other device that happens to answer this path
    const type = readTag(device, 'TYPE');
    const id = readTag(device, 'ID');
    if (!type || !/^EZRCTRL/.test(type) || !id) {
        return null;
    }

    return {
        id,
        type,
        name: readTag(device, 'NAME'),
        firmware: readTag(device, 'VERS_SW_STM'),
    };
}

/** `body` is null when nothing usable came back; `dropped` says the connection broke off */
type FetchCallback = (body: string | null, dropped: boolean) => void;

/**
 * GET /data/static.xml once.
 *
 * Not `tools.httpGet()`: that one goes through the global agent, which keeps the socket open
 * for the next request (the default since Node.js 19) and would hold the only connection of the
 * base station, and it never reports an answer that breaks off half way - which is exactly how
 * the base station turns away a second connection.
 */
function fetchStatic(ip: string, port: number, callback: FetchCallback): void {
    let done = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (body: string | null, dropped: boolean): void => {
        if (done) {
            return;
        }
        done = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        callback(body, dropped);
    };

    let req: http.ClientRequest;
    try {
        req = http.get(
            {
                host: ip,
                port,
                path: STATIC_PATH,
                agent: false,
                headers: { Connection: 'close' },
            },
            (res): void => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return finish(null, false);
                }

                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk: string): void => {
                    body += chunk;
                    if (body.length > MAX_BODY) {
                        // whatever this is, it is not a base station
                        req.destroy();
                        finish(null, false);
                    }
                });
                res.on('end', (): void => finish(body, false));
                // with a listener attached, an answer that breaks off is reported here ...
                res.on('error', (): void => finish(null, true));
                // ... and in any case here
                res.on('close', (): void => finish(res.complete ? body : null, !res.complete));
            },
        );
    } catch {
        return finish(null, false);
    }

    req.on('error', (err: NodeJS.ErrnoException): void =>
        finish(null, err.code === 'ECONNRESET' || err.message === 'socket hang up'),
    );

    timer = setTimeout((): void => {
        timer = null;
        req.destroy();
        finish(null, false);
    }, PROBE_TIMEOUT);
}

/** Try once more - one after the other - when the base station dropped the connection */
function readStatic(ip: string, port: number, attempt: number, callback: (body: string | null) => void): void {
    fetchStatic(ip, port, (body, dropped): void => {
        if (body !== null || !dropped || attempt >= ATTEMPTS) {
            return callback(body);
        }
        setTimeout((): void => readStatic(ip, port, attempt + 1, callback), RETRY_DELAY);
    });
}

/** The adapter keeps one base station per instance, so every base station gets its own proposal */
function addInstance(ip: string, station: Alpha2BaseStation, options: DetectOptions): boolean {
    if (tools.findInstance(options, adapterName, obj => obj.native?.host === ip)) {
        return false;
    }

    const name = station.name || station.id;
    const label = name === station.id ? station.id : `${name} (${station.id})`;

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Möhlenhoff Alpha 2 ${name} (${ip})`,
        },
        native: {
            host: ip,
        },
        comment: {
            add: [`${label}${station.firmware ? `, firmware ${station.firmware}` : ''}`, ip],
        },
    });

    return true;
}

/**
 * Probe one address - `detect()` with the port open, so the tests can use a port that needs no
 * privileges.
 *
 * @param ip address of the device
 * @param port web port of the base station
 * @param options the detection state of this scan
 * @param callback called once with the result
 */
export function probe(ip: string, port: number, options: DetectOptions, callback: DetectCallback): void {
    // A base station that already has an instance is left alone: the adapter is polling it, and
    // every request of ours would take the one connection away from it.
    if (tools.findInstance(options, adapterName, obj => obj.native?.host === ip)) {
        return callback(null, false, ip);
    }

    readStatic(ip, port, 1, (body): void => {
        const station = parseStaticXml(body);
        if (!station) {
            return callback(null, false, ip);
        }

        options.log.debug(`Möhlenhoff Alpha 2 base station ${station.type} detected at ${ip}`);
        callback(null, addInstance(ip, station, options), ip);
    });
}

export function detect(ip: string, _device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    probe(ip, ALPHA2_PORT, options, callback);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
