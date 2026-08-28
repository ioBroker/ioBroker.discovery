import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'deyeidc';

// Deye inverters are read through a Solarman/IGEN data logging stick. The stick keeps its
// AP configuration protocol on UDP 48899: it answers `WIFIKIT-214028-READ` with
// `<ip>,<mac>,<serial>`. Request and answer format are the ones pysolarmanv5 uses, the same
// reference the adapter itself cites for the V5 frame format.
//
// This is the port worth probing, not the data port 8899: the data protocol needs the
// logger serial in every request - and the serial is exactly what this answer delivers.
const DISCOVERY_PORT = 48899;
const LISTEN_PORT = 1238;
const DATA_PORT = 8899;
const PROBE = 'WIFIKIT-214028-READ';
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const MAC = /^[0-9A-Fa-f]{12}$|^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export interface LoggerInfo {
    ip: string;
    mac: string;
    serial: number;
}

/**
 * Parse the answer of a Solarman logging stick.
 *
 * The stick replies with three comma separated fields. Everything else on that port - and
 * 48899 is a busy port, the HF-LPB100 modules use it too - has to be rejected here.
 *
 * @param answer the raw datagram as text
 * @param ip the address the probe was sent to
 */
export function parseLoggerAnswer(answer: string | null, ip: string): LoggerInfo | null {
    if (!answer) {
        return null;
    }
    const parts = answer.trim().split(',');
    if (parts.length < 3) {
        return null;
    }

    const [reportedIp, mac, serial] = parts.map(part => part.trim());
    if (!IPV4.test(reportedIp) || reportedIp !== ip || !MAC.test(mac) || !/^\d+$/.test(serial)) {
        return null;
    }

    // The adapter itself rejects anything below 10^7 as an implausible logger number
    const loggerSn = Number(serial);
    if (!Number.isSafeInteger(loggerSn) || loggerSn < 10 ** 7) {
        return null;
    }

    return { ip: reportedIp, mac, serial: loggerSn };
}

function addInstance(info: LoggerInfo, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.ipaddress === info.ip);

    if (instance) {
        options.log.info(`Deye adapter already present for ${info.ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Deye logger ${info.serial} (${info.ip})`,
        },
        native: {
            ipaddress: info.ip,
            port: DATA_PORT,
            // The data protocol needs this in every request - the user would otherwise have
            // to read it off the stick by hand
            logger: info.serial,
        },
        comment: {
            add: [`Solarman logger ${info.serial}`, info.ip],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let done = false;
    const finish = (found: boolean): void => {
        if (!done) {
            done = true;
            callback(null, found, ip);
        }
    };

    tools.udpScan(ip, DISCOVERY_PORT, '0.0.0.0', LISTEN_PORT, PROBE, PROBE_TIMEOUT, true, (err, message): void => {
        if (err) {
            options.log.debug(`Deye probe to ${ip} failed: ${err as any}`);
            return finish(false);
        }

        const info = parseLoggerAnswer(message, ip);
        if (!info) {
            return finish(false);
        }

        options.log.debug(`Deye/Solarman logger ${info.serial} detected at ${ip}`);
        finish(addInstance(info, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
