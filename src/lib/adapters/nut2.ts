import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'nut2';

const NUT_PORT = 3493;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/**
 * Same server and same probe as `nut.ts`, but a different proposal: nut2 handles a whole NUT
 * server in one instance (`native.host`), while nut creates one instance per UPS. Both are
 * offered, the user picks.
 */
function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(
        options,
        adapterName,
        obj => obj.native.host === ip && obj.native.port === NUT_PORT,
    );

    if (instance) {
        options.log.info(`nut2 adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Network UPS Tools server (${ip})`,
        },
        native: {
            host: ip,
            port: NUT_PORT,
        },
        comment: {
            add: [`NUT server ${ip}`],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let answer = '';

    tools.testPort(
        ip,
        NUT_PORT,
        PROBE_TIMEOUT,
        {
            onConnect: (ip, port, client): void => {
                options.log.debug(`Got connection to NUT on ${ip}:${port}`);
                client.write('LIST UPS\n');
            },
            onReceive: (data): boolean => {
                answer += data.toString();
                // upsd answers a LIST with `BEGIN LIST UPS` and one `UPS <name> "<desc>"` per device
                return answer.includes('BEGIN LIST UPS') || /^UPS\s+\S+/m.test(answer);
            },
        },
        (err, found): void => {
            if (!found) {
                return callback(null, false, ip);
            }
            options.log.debug(`NUT server detected at ${ip}`);
            callback(null, addInstance(ip, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
