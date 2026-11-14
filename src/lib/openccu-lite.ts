import * as http from 'node:http';
import * as https from 'node:https';
import type { ProtocolData } from './types';

/**
 * openccu-lite - a Homematic CCU firmware without ReGaHSS.
 *
 * Its interface processes are reached over the web port with a token (lite-rpc), not over the
 * classic RPC ports, and it has no ReGa at all. The one thing it answers without a credential is
 * the feature detection of its metadata API: `GET /api/meta/v1/version`, JSON with
 * `api: "meta"`. A classic CCU, RaspberryMatic or OpenCCU answers that path with its WebUI's 404
 * page. See https://github.com/openccu-lite/occulited/blob/master/docs/meta-api.md
 */

/** The open feature detection of openccu-lite's metadata API */
export const VERSION_PATH = '/api/meta/v1/version';

/** A version answer is a few hundred bytes - anything much larger is some other web server */
const MAX_BODY = 64 * 1024;

/** What the probe learned about an openccu-lite system */
export interface OpenccuLiteSystem {
    /** Where the version answer came from, e.g. `https://192.168.1.20` */
    url: string;
    https: boolean;
    port: number;
    /** The version answer itself */
    info: ProtocolData;
}

export type OpenccuLiteCallback = (system: OpenccuLiteSystem | null) => void;

/** Whether a parsed version answer is openccu-lite's */
export function isVersionAnswer(info: unknown): info is ProtocolData {
    return !!info && typeof info === 'object' && (info as ProtocolData).api === 'meta';
}

/** The major version of lite-rpc the system speaks, `undefined` when the answer does not say */
export function rpcApiVersion(info: ProtocolData): number | undefined {
    const version = info.capabilities?.apis?.rpc;
    return typeof version === 'number' ? version : undefined;
}

/**
 * The interfaces the system's lite-rpc offers, as the version answer names them (`HmIP-RF`,
 * `BidCos-RF`, ...); `undefined` for a system whose answer does not carry the list yet.
 */
export function interfacesOf(info: ProtocolData): string[] | undefined {
    if (!Array.isArray(info.interfaces)) {
        return undefined;
    }
    return info.interfaces.filter((name: unknown): name is string => typeof name === 'string' && name !== '');
}

/** `false` when an administrator switched the pairing of programs off; `true` otherwise */
export function pairingAllowed(info: ProtocolData): boolean {
    return info.capabilities?.pairing !== false;
}

/** The port a URL goes to, the scheme's default included */
export function portOf(url: URL): number {
    if (url.port) {
        return parseInt(url.port, 10);
    }
    return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Ask an address whether it is openccu-lite.
 *
 * `address` is an IP address or a name (asked on port 80, as a browser would) or an origin such
 * as `http://127.0.0.1:8080`. A redirect is followed once - the system sends plain HTTP to HTTPS
 * when its redirect is on - and the certificate is not checked: the probe sends nothing but the
 * GET, and the default certificate of a CCU is self-signed. `timeout` covers the whole probe,
 * the redirect included. The callback gets `null` for anything that is not openccu-lite's
 * version answer, and is called exactly once.
 */
export function probe(address: string, timeout: number, callback: OpenccuLiteCallback | null): void {
    let origin: string;
    if (/^https?:\/\//.test(address)) {
        origin = address.replace(/\/+$/, '');
    } else {
        origin = `http://${address.includes(':') ? `[${address}]` : address}`;
    }

    let request: http.ClientRequest | null = null;
    let timer: NodeJS.Timeout | null = setTimeout((): void => finish(null), timeout);

    function finish(system: OpenccuLiteSystem | null): void {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        request?.destroy();
        request = null;
        callback?.(system);
        callback = null;
    }

    function ask(url: URL, redirects: number): void {
        const isHttps = url.protocol === 'https:';
        const options: https.RequestOptions = {
            headers: { Accept: 'application/json', Connection: 'close' },
            agent: false,
            rejectUnauthorized: false,
        };
        const onResponse = (res: http.IncomingMessage): void => {
            const status = Number(res.statusCode);
            if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
                res.resume();
                let next: URL;
                try {
                    next = new URL(res.headers.location, url);
                } catch {
                    return finish(null);
                }
                if (next.protocol !== 'http:' && next.protocol !== 'https:') {
                    return finish(null);
                }
                return ask(new URL(VERSION_PATH, next.origin), redirects - 1);
            }
            if (status !== 200) {
                res.resume();
                return finish(null);
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string): void => {
                body += chunk;
                if (body.length > MAX_BODY) {
                    finish(null);
                }
            });
            res.on('end', (): void => {
                let info: unknown;
                try {
                    info = JSON.parse(body);
                } catch {
                    return finish(null);
                }
                if (!isVersionAnswer(info)) {
                    return finish(null);
                }
                finish({ url: url.origin, https: isHttps, port: portOf(url), info });
            });
        };
        const req = isHttps ? https.get(url, options, onResponse) : http.get(url, options, onResponse);
        req.on('error', (): void => finish(null));
        request = req;
    }

    let first: URL;
    try {
        first = new URL(VERSION_PATH, origin);
    } catch {
        return finish(null);
    }
    ask(first, 1);
}
