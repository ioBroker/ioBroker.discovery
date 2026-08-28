import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'sonoff';

// Tasmota answers `GET /cm?cmnd=Status` with { "Status": { "FriendlyName": [...], ... } }.
// Verified twice over: Gladys discovers Tasmota devices on the network with exactly this
// call (server/services/tasmota/lib/http), and the firmware's own tools/decode-status.py
// reads obj["Status"]["FriendlyName"][0] from it.
//
// The sonoff adapter itself only speaks MQTT, which is why the probe cannot come from its
// source - it is the device that is being recognised here, not the adapter's transport.
const TASMOTA_PORT = 80;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

export interface TasmotaInfo {
    /** The device is there but its web interface is password protected */
    needsAuth: boolean;
    name?: string;
    /** MQTT topic the device publishes under - what the sonoff adapter keys its objects on */
    topic?: string;
    module?: number;
}

/**
 * Read the answer of `/cm?cmnd=Status`.
 *
 * A password protected Tasmota answers 200 with `{"WARNING":"Need user=&password="}` instead
 * of the status - that is still proof of a Tasmota, just without any detail.
 *
 * @param body the raw answer
 */
export function parseTasmotaStatus(body: string | null): TasmotaInfo | null {
    if (!body) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return null;
    }
    if (!answer || typeof answer !== 'object') {
        return null;
    }

    if (typeof answer.WARNING === 'string') {
        return { needsAuth: true };
    }

    const status = answer.Status;
    if (!status || typeof status !== 'object' || !Array.isArray(status.FriendlyName)) {
        return null;
    }

    return {
        needsAuth: false,
        name: typeof status.FriendlyName[0] === 'string' ? status.FriendlyName[0] : undefined,
        topic: typeof status.Topic === 'string' ? status.Topic : undefined,
        module: typeof status.Module === 'number' ? status.Module : undefined,
    };
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let done = false;
    // tools.httpGet reports twice when a non-200 answer carries a body - see its comment
    const finish = (found: boolean): void => {
        if (!done) {
            done = true;
            callback(null, found, ip);
        }
    };

    tools.httpGet(`http://${ip}:${TASMOTA_PORT}/cm?cmnd=Status`, PROBE_TIMEOUT, (err, data): void => {
        if (err) {
            // A bare 401 is not enough - every protected web server answers that way
            return finish(false);
        }

        const info = parseTasmotaStatus(data);
        if (!info) {
            return finish(false);
        }

        options.log.debug(`Tasmota device detected at ${ip}${info.needsAuth ? ' (password protected)' : ''}`);

        // The sonoff adapter is an MQTT broker for all Tasmota devices at once and keeps no
        // device address in its configuration, so one instance covers the whole network.
        const label = info.needsAuth
            ? `Tasmota ${ip} (web interface is password protected)`
            : [info.name || 'Tasmota', info.topic && `topic ${info.topic}`, ip].filter(Boolean).join(', ');

        finish(tools.proposeSharedInstance(adapterName, label, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
