import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'opendtu';

// OpenDTU (tbnobody/OpenDTU, src/NetworkSettings.cpp, handleMDNS()) announces `_opendtu._tcp`
// on port 80 - but only when mDNS is switched on in its network settings (off by default).
// Seen on an OpenDTU v26.11.11 with host name `OpenDTU`: PTR, SRV and TXT come as answers, the
// A record only as an additional record, which the mDNS method does not pass on.
const OPENDTU_SERVICE = '_opendtu._tcp';

// The address an answer came from is not always the OpenDTU's: an mDNS reflector (UniFi gateways,
// Avahi with `enable-reflector`) repeats it from its own address. So the address is checked before
// it is proposed. `/site.webmanifest` is static JSON (`"name": "OpenDTU"`) that OpenDTU serves
// without credentials - unlike `/api/system/status`, which answers 401 once read-only access is
// switched off. An OpenDTU answers in about 0.1 s.
const PROBE_TIMEOUT = 1500;

/**
 * True when the page is the web app manifest of OpenDTU (or of a fork such as OpenDTU-OnBattery).
 *
 * @param body the body of `/site.webmanifest`
 */
function isOpenDtuManifest(body: string | null): boolean {
    if (typeof body !== 'string') {
        return false;
    }
    try {
        const manifest = JSON.parse(body);
        return typeof manifest?.name === 'string' && manifest.name.toLowerCase().startsWith('opendtu');
    } catch {
        return false;
    }
}

/**
 * Propose one opendtu instance per OpenDTU that announces itself via mDNS.
 *
 * @param ip address the mDNS answer came from
 * @param device the device as delivered by the mdns method
 * @param options the detection state of this scan
 * @param callback called once with the result
 */
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, OPENDTU_SERVICE)) {
        return callback(null, false, ip);
    }

    // One instance per OpenDTU, addressed by `native.webUIServer` (an IP address or a host name)
    const name = tools.mdnsName(device) || 'OpenDTU';
    const hostname = `${name}.local`.toLowerCase();
    if (
        tools.findInstance(options, adapterName, obj => {
            const server = String(obj.native?.webUIServer || '').toLowerCase();
            return server === ip || server === name.toLowerCase() || server === hostname;
        })
    ) {
        return callback(null, false, ip);
    }

    // `httpGet`'s timeout is an idle timeout, so the probe has its own deadline; a later answer is ignored
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

    tools.httpGet(`http://${ip}/site.webmanifest`, PROBE_TIMEOUT).then(
        body => {
            if (done) {
                return;
            }
            if (!isOpenDtuManifest(body)) {
                // @KI_HINWEIS: typical for an mDNS reflector - the OpenDTU is in another network and its
                // real address is not in the answers. Nothing is proposed rather than a wrong address.
                options.log.debug(`OpenDTU "${name}" announced via ${ip}, but ${ip} is no OpenDTU - not proposed`);
                return finish(false);
            }
            options.log.debug(`OpenDTU "${name}" detected at ${ip}`);
            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: { name: adapterName },
                // The password stays empty: it is entered in the adapter settings when read-only
                // access is switched off in OpenDTU
                native: { webUIScheme: 'http', webUIServer: ip, webUIPort: 80 },
                comment: { add: [name, ip] },
            });
            finish(true);
        },
        () => finish(false),
    );
}

export const type = ['mdns'];
// main.ts arms its watchdog with this value before calling detect(), so it must outlast the probe
export const timeout = PROBE_TIMEOUT + 500;
