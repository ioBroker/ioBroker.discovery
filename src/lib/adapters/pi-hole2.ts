import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'pi-hole2';

const PIHOLE_PORT = 80;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * `/api/auth` is the session check of the Pi-hole v6 API - the same call the adapter's own
 * client makes before logging in. Without credentials it answers 401 *with* a body that
 * describes the session, which is exactly the fingerprint we want and needs no password.
 *
 * That 401 is also why this uses testPort with a raw request instead of tools.httpGet:
 * httpGet reports a non-200 answer before its body has arrived, so the body would be lost.
 */
const REQUEST =
    'GET /api/auth HTTP/1.1\r\nHost: %HOST%\r\nAccept: application/json\r\nConnection: close\r\nUser-Agent: ioBroker.discovery\r\n\r\n';

/** The answer describes a session, whether or not one is established */
export function isPiholeAnswer(answer: string): boolean {
    if (!answer.includes('"session"')) {
        return false;
    }
    const bodyStart = answer.indexOf('\r\n\r\n');
    const body = bodyStart === -1 ? answer : answer.substring(bodyStart + 4);
    try {
        const parsed = JSON.parse(body);
        return !!parsed && typeof parsed.session === 'object' && parsed.session !== null;
    } catch {
        // The body may still be incomplete - the marker above is then all we have
        return true;
    }
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const address = `http://${ip}`;
    const instance = tools.findInstance(options, adapterName, obj => obj.native.address === address);

    if (instance) {
        options.log.info(`Pi-hole adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Pi-hole (${ip})`,
        },
        native: {
            // the adapter keeps the full base URL, plus protocol and port separately
            address,
            protocol: 'http',
            port: String(PIHOLE_PORT),
        },
        comment: {
            add: ['Pi-hole', ip],
            // Without it the adapter can read nothing - better to say so up front
            inputs: [
                {
                    name: 'native.password',
                    def: '',
                    type: 'password',
                    title: 'Pi-hole app password',
                },
            ],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let answer = '';

    tools.testPort(
        ip,
        PIHOLE_PORT,
        PROBE_TIMEOUT,
        {
            onConnect: (ip, port, client): void => {
                client.write(REQUEST.replace('%HOST%', `${ip}:${port}`));
            },
            onReceive: (data): boolean | null => {
                answer += data.toString();
                if (isPiholeAnswer(answer)) {
                    return true;
                }
                // keep listening while the answer could still be incomplete
                return answer.length > 8192 ? false : null;
            },
        },
        (err, found): void => {
            if (!found) {
                return callback(null, false, ip);
            }
            options.log.debug(`Pi-hole detected at ${ip}`);
            callback(null, addInstance(ip, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
