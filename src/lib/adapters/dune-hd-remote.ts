import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'dune-hd-remote';

// The adapter's dune-player.js sends every command as /cgi-bin/do?cmd=... and reads
// `command_status` out of the XML answer.
const DUNE_PORT = 80;
const PROBE_TIMEOUT = 1400;
// main.js arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the probe - otherwise the watchdog wins the race and a late answer is thrown away.
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

/** The player answers XML that carries a command_status parameter */
export function isDuneAnswer(body: string | null): boolean {
    return !!body && /command_status/.test(body) && /<command_result[\s>]/i.test(body);
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.playerIP === ip);

    if (instance) {
        options.log.info(`Dune HD adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Dune HD player (${ip})`,
        },
        native: {
            playerIP: ip,
            playerPort: DUNE_PORT,
        },
        comment: {
            add: ['Dune HD', ip],
        },
    });

    return true;
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

    tools.httpGet(`http://${ip}:${DUNE_PORT}/cgi-bin/do?cmd=status`, PROBE_TIMEOUT, (err, data): void => {
        if (err || !isDuneAnswer(data)) {
            return finish(false);
        }

        options.log.debug(`Dune HD player detected at ${ip}`);
        finish(addInstance(ip, options));
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
