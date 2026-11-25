import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'snapmaker-u1';
const MOONRAKER_PORT = 7125;
// The real U1 took about five seconds to return system_info; allow that one read to finish.
const PROBE_TIMEOUT = 6000;
const MODEL = 'Snapmaker U1';

// Snapmaker/u1-moonraker, ed7b3752a9a938c87ee086f3b7b21a9352a2a0c9:
// moonraker/components/zeroconf.py announces _snapmaker._tcp with machine_type.
// Its SRV port is LAN MQTT (1884), NOT the Moonraker HTTP port (7125).
// machine.py puts the same machine_type in result.system_info.product_info.
// The HTTP shape was verified on a physical U1 running PAXX12 (see the test fixture).
const SERVICE = '_snapmaker._tcp';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSnapmakerU1Response(value: unknown): boolean {
    if (!isRecord(value) || !isRecord(value.result) || !isRecord(value.result.system_info)) {
        return false;
    }
    const product = value.result.system_info.product_info;
    return isRecord(product) && product.machine_type === MODEL;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let finished = false;
    const finish = (found: boolean): void => {
        if (!finished) {
            finished = true;
            callback(null, found, ip);
        }
    };

    const exists = (): boolean => !!tools.findInstance(options, adapterName, obj => obj.native?.host === ip);
    if (exists()) {
        return finish(false);
    }

    const propose = (): void => {
        // mDNS and IP scans can finish in either order; never propose the device twice.
        if (exists()) {
            return finish(false);
        }
        options.newInstances.push({
            _id: tools.getNextInstanceID(adapterName, options),
            common: { name: adapterName },
            native: { host: ip, port: MOONRAKER_PORT },
            comment: { add: [MODEL, ip] },
        });
        options.log.debug(`Snapmaker U1 detected at ${ip}`);
        finish(true);
    };

    if (device._mdns) {
        if (tools.hasMdnsService(device, SERVICE) && tools.mdnsTxt(device).machine_type === MODEL) {
            return propose();
        }
        // Unrelated or incomplete announcements are not a reason to query a host.
        // The IP scan below provides the fallback when U1 mDNS does not reach this network.
        return finish(false);
    }

    // One read-only request per IP candidate, no port sweep, login, writes or commands.
    // A generic Klipper/Moonraker answer is insufficient: require Snapmaker's model field.
    tools.httpGet(
        `http://${ip.includes(':') ? `[${ip}]` : ip}:${MOONRAKER_PORT}/machine/system_info`,
        PROBE_TIMEOUT,
        (error, body): void => {
            if (finished) {
                return;
            }
            if (error || !body) {
                return finish(false);
            }
            let info: unknown;
            try {
                info = JSON.parse(body);
            } catch {
                return finish(false);
            }
            if (!isSnapmakerU1Response(info)) {
                return finish(false);
            }
            propose();
        },
    );
}

export const type = ['mdns', 'ip'];
export const timeout = PROBE_TIMEOUT + 500;
