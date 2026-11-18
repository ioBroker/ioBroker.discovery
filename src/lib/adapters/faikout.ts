import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'faikout';

// Faikout modules (ESP32 firmware by RevK for Daikin air conditioners, https://codeberg.org/RevK/ESP32-Faikout,
// called Faikin before 2025) announce nothing but a plain `_http._tcp` service: the RevK library calls
// `mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0)`, the instance name is the description or host name
// the user set, and there is no TXT record. mDNS alone cannot tell them from any other web server.
const HTTP_SERVICE = '_http._tcp';

// What does tell them apart is the footer `revk_web_foot()` (ESP32-RevK, revk.c) writes under every page:
//   <hr><address>[<a href=/>Home</a> ][<a href=/revk-settings[?_page=0]>Settings</a> ]<app>[<small><build suffix></small>]: <version> <build date>[ <b><extra></b>]...</address>
// `<app>` is the firmware name. Other RevK firmware (Solar Garden, Elora, GPS, ...) writes the same footer
// with its own name, so only `Faikout` and its former name `Faikin` are accepted. On the start page the
// bold part is the protocol the module speaks to the air conditioner (S21, X50A, ...).
// Seen on three modules: `<hr><address><a href=/revk-settings?_page=0>Settings</a> Faikout<small>-S3-MINI-N4-R2</small>: f4ba4a82 2026-10-11T08:15:45 <b>S21</b></address>`
const reFooter =
    /<address>(?:<a href=\/>Home<\/a> )?(?:<a href=\/revk-settings[^>]*>Settings<\/a> )?(Faikout|Faikin)(?:<small>([^<]*)<\/small>)?: ([^\s<]+) [^\s<]+(?: <b>([^<]*)<\/b>)?/;
const reTitle = /<title>([^<]*)<\/title>/i;

// The start page `/` is asked, not `/revk-settings`: it carries the same footer, needs no settings password,
// and does not list the module's MQTT and WiFi settings. A GET without a query string changes nothing
// (`web_root()` in Faikout.c shows the control page, or the settings page when web control is off).
// A module answers in 0.1-0.5 s.
const PROBE_TIMEOUT = 1500;

// Service types out of PTR/SRV records: `_http._tcp.local` as well as `Name._http._tcp.local`
const reServiceType = /(?:^|\.)(_[^.]+\._(?:tcp|udp))\.local\.?$/i;

/**
 * True when the device announced `_http._tcp` and no other service.
 *
 * A Faikout module has no other service. Asking only those devices keeps the probe away from everything
 * that announces more (Shelly, printers, NAS, media players, ...).
 */
function onlyHttp(device: DiscoveryDevice): boolean {
    const types = new Set<string>();
    for (const record of ['PTR', 'SRV']) {
        for (const field of ['name', 'data'] as const) {
            for (const value of tools.mdnsValues(device, record, field)) {
                const match = value.match(reServiceType);
                if (match && match[1].toLowerCase() !== '_dns-sd._udp') {
                    types.add(match[1].toLowerCase());
                }
            }
        }
    }
    return types.size === 1 && types.has(HTTP_SERVICE);
}

/**
 * True when the device announced a TXT record with content.
 *
 * A Faikout module announces none. Web servers that do (switches, access points, inverters, Shelly
 * generation 1, ...) are therefore not asked. The core may deliver the record data as a Buffer, an array
 * or - after merging several answers - as a plain object with numeric keys.
 */
function hasTxt(device: DiscoveryDevice): boolean {
    const data = device._mdns?.TXT?.data;
    if (data === undefined || data === null) {
        return false;
    }
    if (typeof data === 'string') {
        return data.length > 0;
    }
    if (typeof data !== 'object') {
        return true;
    }
    const values: unknown[] = Array.isArray(data) || Buffer.isBuffer(data) ? [...data] : Object.values(data);
    // an empty TXT record is a single zero byte
    return values.some(value => (typeof value === 'number' ? value !== 0 : !!value && Object.keys(value).length > 0));
}

/**
 * An mDNS reflector (UniFi gateways, Avahi with `enable-reflector`) repeats the answers of other hosts
 * from its own address, A records included. A module only ever names its own address.
 */
function namesForeignAddress(ip: string, device: DiscoveryDevice): boolean {
    return tools.mdnsValues(device, 'A', 'data').some(address => address !== ip);
}

function unescapeHtml(text: string): string {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function label(ip: string, device: DiscoveryDevice, body: string, footer: RegExpMatchArray): string {
    const [, app, , version, protocol] = footer;
    let name = unescapeHtml(body.match(reTitle)?.[1] || '').trim();
    if (!name || name === 'Settings') {
        // web control switched off: `/` shows the settings page
        name = tools.mdnsName(device);
    }
    const details = [`${app} ${version}`, protocol?.trim()].filter(Boolean).join(', ');
    return `${name || app} (${ip}), ${details}`;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!onlyHttp(device) || hasTxt(device) || namesForeignAddress(ip, device)) {
        return callback(null, false, ip);
    }

    // The modules connect to the adapter's MQTT broker on their own, so one instance serves all of them.
    // When an instance exists there is nothing to propose, and the modules are not asked at all.
    if (tools.findInstance(options, adapterName)?._existing) {
        return callback(null, false, ip);
    }

    // `httpGet`'s timeout is an idle timeout: a server that trickles its answer (seen on a NAS) holds the
    // request far longer. So the probe has its own deadline, and whatever comes later is ignored.
    let done = false;
    const deadline = setTimeout((): void => {
        if (!done) {
            done = true;
            callback(null, false, ip);
        }
    }, PROBE_TIMEOUT);
    const finish = (found: boolean): void => {
        if (!done) {
            done = true;
            clearTimeout(deadline);
            callback(null, found, ip);
        }
    };

    tools.httpGet(`http://${ip}/`, PROBE_TIMEOUT).then(
        body => {
            const footer = !done && typeof body === 'string' ? body.match(reFooter) : null;
            if (!footer) {
                return finish(false);
            }
            const text = label(ip, device, body as string, footer);
            options.log.debug(`Faikout module detected: ${text}`);
            // DEPENDENCY on the faikout adapter - nothing in its `native` is written, on purpose. The proposal relies
            // on three things only, and these must not change in the adapter:
            //  - the adapter name `faikout` (also the file name of this module),
            //  - an instance with nothing but the io-package defaults starts and opens its MQTT broker (`port`,
            //    default 1888, the port the modules' `mqtthost` points at),
            //  - one instance serves every module, so any configured instance means "nothing to propose".
            // Checked with 0.1.0 (stable), 0.2.1 and 1.0.0: 0.1.x/0.2.x have `port`, `user`, `pass`, `historyRegister`,
            // `historyInstance`; 1.0.0 keeps those and adds `brokerModus` (default "intern"), `extern*`, `moduleAddress`
            // and the `regel*` settings. Whoever fills in a `native` field here has to check it against every line.
            finish(tools.proposeSharedInstance(adapterName, text, options));
        },
        () => finish(false),
    );
}

export const type = ['mdns'];
// main.ts arms its watchdog with this value before calling detect(), so it must outlast the probe
export const timeout = PROBE_TIMEOUT + 500;
