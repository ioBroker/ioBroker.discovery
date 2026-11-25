import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'jellyfin';

// Jellyfin servers answer the client discovery on UDP 7359 (Jellyfin.Networking/AutoDiscoveryHost.cs):
// a datagram that contains `who is JellyfinServer?` gets the JSON of `ServerDiscoveryInfo` back,
//   {"Address":"http://192.168.1.14:8096","Id":"17be1319e5ed41c0b95361ed7b979f55","Name":"Wohnzimmer","EndpointAddress":null}
// Only this text is answered - `who is EmbyServer?` (emby.ts) is not, so the two modules never propose the
// other server. The listener runs while "Enable auto discovery" is on (network settings, default on). A
// server in a Docker bridge network answers only when 7359/udp is published as well.
const PROBE = 'who is JellyfinServer?';
const DISCOVERY_PORT = 7359;
const PROBE_TIMEOUT = 1400;

// `Address` is what Jellyfin thinks a client should use (`GetSmartApiUrl`): the published server URL if one is
// set, otherwise an address of the server - in Docker the address inside the container. Only scheme and port
// are taken from it; the host is always the address that answered, which is the one the probe was sent to.
/**
 * Builds the server address for the adapter from the answering IP and the reported `Address`.
 *
 * @param ip address that answered
 * @param address `Address` of the answer
 */
export function serverUrl(ip: string, address: unknown): string {
    let protocol = 'http:';
    let port = '8096';
    if (typeof address === 'string' && address) {
        try {
            const url = new URL(address.includes('://') ? address : `http://${address}`);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
                protocol = url.protocol;
                port = url.port || (url.protocol === 'https:' ? '443' : '80');
            }
        } catch {
            // keep the defaults
        }
    }
    const standard = (protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443');
    return `${protocol}//${ip}${standard ? '' : `:${port}`}`;
}

/**
 * Host part of a configured server address (lower case), '' when it cannot be read.
 *
 * @param url configured address of an instance
 */
function hostOf(url: unknown): string {
    if (typeof url !== 'string' || !url.trim()) {
        return '';
    }
    try {
        const text = url.trim();
        return new URL(text.includes('://') ? text : `http://${text}`).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function addInstance(ip: string, data: ProtocolData, options: DetectOptions, callback: DetectCallback): void {
    const url = serverUrl(ip, data.Address);
    const name = typeof data.Name === 'string' && data.Name ? data.Name : ip;

    const instance = tools.findInstance(options, adapterName, obj => hostOf(obj.native.url) === ip.toLowerCase());
    if (instance) {
        callback(null, false, ip);
        return;
    }
    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Jellyfin (${name})`,
        },
        native: {
            url,
            // the API key has to be created in the Jellyfin dashboard - it cannot be discovered
            apiKey: '',
        },
        comment: {
            add: `${name} (${url})`,
        },
    });
    callback(null, true, ip);
}

export function detect(ip: string, _device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // Listen port 0: every probe gets its own port, so parallel probes for several addresses cannot
    // receive each other's answers.
    tools.udpScan(ip, DISCOVERY_PORT, '0.0.0.0', 0, PROBE, PROBE_TIMEOUT, (err, data, remote): void => {
        if (err || !data) {
            callback(null, false, ip);
            return;
        }
        let parsed: ProtocolData;
        try {
            parsed = JSON.parse(data);
        } catch {
            callback(null, false, ip);
            return;
        }
        // An answer from another address (e.g. a broadcast relay) does not belong to this ip
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !parsed.Id ||
            !parsed.Address ||
            (remote && remote.address !== ip)
        ) {
            callback(null, false, ip);
            return;
        }
        options.log.debug(`jellyfin: server "${parsed.Name}" (${parsed.Id}) at ${ip}`);
        addInstance(ip, parsed, options, callback);
    });
}

export const type = ['ip'];
// main.ts arms its watchdog with this value before it calls detect(), so it has to be larger than the probe.
export const timeout = PROBE_TIMEOUT + 300;
