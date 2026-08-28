import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'nspanel-lovelace-ui';

/**
 * A Sonoff NSPanel runs Tasmota, and the adapter talks to it over exactly the two calls used
 * here (`main.js`): `cmnd=status 0` for the device data and `cmnd=GetDriverVersion`, which is
 * a command of the adapter's *own* Berry driver and answers `{"nlui_driver_version": ...}`.
 *
 * That second call is the only unambiguous proof, and it only works on a panel that already
 * runs the driver - after an ioBroker reinstall, or for a panel that was set up by hand. A
 * freshly flashed panel is recognised the weaker way: an ESP32 Tasmota that calls itself
 * NSPanel. That is a name, not a fingerprint, and the proposal says so.
 */
const TASMOTA_PORT = 80;
const PROBE_TIMEOUT = 1400;
const DRIVER_TIMEOUT = 1000;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than both probes together
const DETECT_TIMEOUT = PROBE_TIMEOUT + DRIVER_TIMEOUT + 300;

export interface PanelInfo {
    /** ESP32 Tasmota - an NSPanel can be nothing else */
    isEsp32: boolean;
    /** the name says NSPanel */
    namedNsPanel: boolean;
    name?: string;
    topic?: string;
    mac?: string;
}

/**
 * Read the answer of `cmnd=status 0`, which folds Status, StatusNET and StatusFWR into one
 * document.
 *
 * @param body the raw answer
 */
export function parseStatus0(body: string | null): PanelInfo | null {
    if (!body) {
        return null;
    }
    let answer: ProtocolData;
    try {
        answer = JSON.parse(body);
    } catch {
        return null;
    }

    const status = answer?.Status;
    if (!status || typeof status !== 'object' || !Array.isArray(status.FriendlyName)) {
        return null;
    }

    const name = typeof status.FriendlyName[0] === 'string' ? status.FriendlyName[0] : undefined;
    const topic = typeof status.Topic === 'string' ? status.Topic : undefined;
    const hostname = typeof answer.StatusNET?.Hostname === 'string' ? answer.StatusNET.Hostname : undefined;
    const hardware = typeof answer.StatusFWR?.Hardware === 'string' ? answer.StatusFWR.Hardware : '';

    return {
        isEsp32: /ESP32/i.test(hardware),
        namedNsPanel: [name, topic, hostname, status.DeviceName].some(
            value => typeof value === 'string' && /nspanel/i.test(value),
        ),
        name,
        topic,
        mac: typeof answer.StatusNET?.Mac === 'string' ? answer.StatusNET.Mac : undefined,
    };
}

/**
 * True if the answer comes from the Berry driver of this adapter.
 *
 * `GetDriverVersion` is not a Tasmota command - a panel without the driver answers with
 * Tasmota's `{"Command":"Unknown"}`.
 *
 * @param body the raw answer
 */
export function hasNluiDriver(body: string | null): boolean {
    if (!body) {
        return false;
    }
    try {
        const answer = JSON.parse(body);
        return typeof answer?.nlui_driver_version === 'string' || typeof answer?.nlui_driver_version === 'number';
    } catch {
        return false;
    }
}

/**
 * The row for the adapter's panel table and the wording of the proposal.
 *
 * Split out from {@link addPanel} because the two probes sit on port 80, which an unprivileged
 * process cannot bind - the wiring is only testable where that is allowed, this is testable
 * everywhere.
 *
 * @param ip address of the panel
 * @param info what `status 0` said about it
 * @param certain whether the Berry driver confirmed it, as opposed to the name suggesting it
 */
export function describePanel(
    ip: string,
    info: PanelInfo,
    certain: boolean,
): { row: ProtocolData; label: string; topic: string } {
    const topic = info.topic || info.name || ip;
    const name = info.name || topic;

    return {
        // the shape of one row of the adapter's panel table
        row: { topic, name, ip },
        label: certain ? `NSPanel ${name} (${ip})` : `Tasmota ${name} (${ip}) - looks like an NSPanel, please confirm`,
        topic,
    };
}

function addPanel(ip: string, info: PanelInfo, certain: boolean, options: DetectOptions): boolean {
    const { row, label, topic } = describePanel(ip, info, certain);

    const existing = tools.findInstance(options, adapterName, obj =>
        (obj.native.panels || []).some((panel: ProtocolData) => panel?.ip === ip || panel?.topic === topic),
    );
    if (existing) {
        options.log.info(`nspanel-lovelace-ui already knows the panel at ${ip}`);
        return false;
    }

    // One instance drives every panel, so all finds of a scan collect in one proposal
    const added = tools.proposeSharedInstance(adapterName, label, options, { panels: [] });

    const instance = tools.pendingProposal(options, adapterName);
    if (instance && !instance._existing) {
        instance.native.panels ||= [];
        (instance.native.panels as ProtocolData[]).push(row);
        instance.comment ||= {};
        // the adapter is an MQTT client, and the panel has to be told the same broker
        instance.comment.inputs ||= [
            { name: 'native.mqttIp', def: '', type: 'text', title: 'MQTT broker address' },
            { name: 'native.mqttPort', def: 1883, type: 'number', title: 'MQTT broker port' },
        ];
    }

    return added;
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

    tools.httpGet(`http://${ip}:${TASMOTA_PORT}/cm?cmnd=status%200`, PROBE_TIMEOUT, (err, data): void => {
        if (err) {
            return finish(false);
        }

        const info = parseStatus0(data);
        if (!info || !info.isEsp32) {
            // every NSPanel is an ESP32; anything else is some other Tasmota and stays with sonoff
            return finish(false);
        }

        // Ask the driver only when the name did not already give the panel away - that keeps
        // the second call off every ordinary ESP32 Tasmota that answered above.
        if (info.namedNsPanel) {
            options.log.debug(`NSPanel detected at ${ip} (by name)`);
            return finish(addPanel(ip, info, false, options));
        }

        let asked = false;
        tools.httpGet(`http://${ip}:${TASMOTA_PORT}/cm?cmnd=GetDriverVersion`, DRIVER_TIMEOUT, (e, body): void => {
            if (asked) {
                return;
            }
            asked = true;

            if (e || !hasNluiDriver(body)) {
                return finish(false);
            }
            options.log.debug(`NSPanel detected at ${ip} (Berry driver answered)`);
            finish(addPanel(ip, info, true, options));
        });
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
