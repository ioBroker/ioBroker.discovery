import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'zigbee2mqtt';

// The adapter's default connection is a WebSocket to ws://<wsServerIP>:<wsServerPort>/api,
// and the frontend it links to sits on the same port.
const Z2M_PORT = 8080;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * A WebSocket handshake is the honest probe here: Zigbee2MQTT serves its API as a socket, not
 * as REST. Only something that actually speaks WebSocket on /api answers `101 Switching
 * Protocols` - a plain web server on this very common port answers 400 or 404 instead.
 */
const REQUEST =
    'GET /api HTTP/1.1\r\n' +
    'Host: %HOST%\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Key: aG9tZWF1dG9tYXRpb24xMg==\r\n' +
    'Sec-WebSocket-Version: 13\r\n' +
    '\r\n';

/** The upgrade succeeded - whatever is there speaks WebSocket on /api */
export function isWebSocketUpgrade(answer: string): boolean {
    return /^HTTP\/1\.[01] 101\b/i.test(answer) && /upgrade:\s*websocket/i.test(answer);
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.wsServerIP === ip);

    if (instance) {
        options.log.info(`Zigbee2MQTT adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Zigbee2MQTT (${ip})`,
        },
        native: {
            connectionType: 'ws',
            wsScheme: 'ws',
            wsServerIP: ip,
            wsServerPort: Z2M_PORT,
            // the adapter links to the frontend, which is served on the same address
            webUIScheme: 'http',
            webUIServer: ip,
            webUIPort: Z2M_PORT,
        },
        comment: {
            add: ['Zigbee2MQTT', ip],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let answer = '';

    tools.testPort(
        ip,
        Z2M_PORT,
        PROBE_TIMEOUT,
        {
            onConnect: (ip, port, client): void => {
                client.write(REQUEST.replace('%HOST%', `${ip}:${port}`));
            },
            onReceive: (data): boolean | null => {
                answer += data.toString();
                if (isWebSocketUpgrade(answer)) {
                    return true;
                }
                // the status line is in the first packet; anything else settles quickly
                return answer.includes('\r\n\r\n') || answer.length > 4096 ? false : null;
            },
        },
        (err, found): void => {
            if (!found) {
                return callback(null, false, ip);
            }
            options.log.debug(`Zigbee2MQTT detected at ${ip}`);
            callback(null, addInstance(ip, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
