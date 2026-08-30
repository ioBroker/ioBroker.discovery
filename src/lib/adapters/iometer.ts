import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'iometer';

/**
 * The IOmeter reading head on an electricity meter.
 *
 * The adapter opens two Server-Sent-Event streams, `http://<ip>/v1/reading` and
 * `http://<ip>/v1/status` (`main.js`), and reads `statusEvent` messages from the second one.
 *
 * A stream never ends, which is why `tools.httpGet` is no use here - it waits for the end of
 * the answer. The request goes out on the raw socket instead and only the beginning of the
 * answer is looked at: an SSE content type on that path is the fingerprint, and the first
 * event confirms it when it arrives inside the probe window.
 */
const IOMETER_PORT = 80;
const PROBE_TIMEOUT = 1500;
// main.ts arms its watchdog with this before it calls detect(), so leave the probe room
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** The HTTP request, written by hand because the answer is an endless stream */
export function statusRequest(ip: string): string {
    return (
        `GET /v1/status HTTP/1.1\r\n` +
        `Host: ${ip}\r\n` +
        `Accept: text/event-stream\r\n` +
        `Connection: close\r\n\r\n`
    );
}

/**
 * True if this is the beginning of the IOmeter status stream.
 *
 * @param answer everything received so far
 */
export function isStatusStream(answer: string): boolean {
    if (!answer || !/^HTTP\/1\.[01] 200/.test(answer)) {
        return false;
    }
    return /content-type:\s*text\/event-stream/i.test(answer);
}

/**
 * Meter number out of the first status event, if one already arrived.
 *
 * @param answer everything received so far
 */
export function meterNumber(answer: string): string | null {
    const match = /"meter"\s*:\s*\{[^}]*"number"\s*:\s*"([^"]+)"/.exec(answer);
    return match ? match[1] : null;
}

function addInstance(ip: string, meter: string | null, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.iometerIp === ip);

    if (instance) {
        options.log.info(`iometer adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `IOmeter (${ip})`,
        },
        native: {
            iometerIp: ip,
        },
        comment: {
            add: [meter ? `IOmeter on meter ${meter} (${ip})` : `IOmeter (${ip})`],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let answer = '';

    tools.testPort(
        ip,
        IOMETER_PORT,
        PROBE_TIMEOUT,
        {
            onConnect: (_ip, _port, client): void => {
                client.write(statusRequest(ip));
            },
            onReceive: (data): tools.PortReceiveResult => {
                answer += data.toString('utf8');
                if (!answer.includes('\r\n\r\n')) {
                    return null; // headers still arriving
                }
                if (!isStatusStream(answer)) {
                    return false;
                }
                // keep reading a little longer if the first event can still make the window
                return meterNumber(answer) || answer.length > 4096 ? true : null;
            },
        },
        (err, found): void => {
            // the stream does not end, so the probe usually runs into its own timeout with the
            // headers already in hand - that is a find, not a failure
            if (err || (!found && !isStatusStream(answer))) {
                return callback(null, false, ip);
            }

            options.log.debug(`IOmeter detected at ${ip}`);
            callback(null, addInstance(ip, meterNumber(answer), options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
