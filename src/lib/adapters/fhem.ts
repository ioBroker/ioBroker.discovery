import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    const name = ip + (device._name && device._name !== ip ? ` - ${device._name}` : '');

    tools.testPort(
        ip,
        7072,
        500,
        {
            onConnect: (ip, port, client): boolean => client.write('\n\n\njsonlist2\n'), // assume there is no password
            onReceive: data => data && !!data.toString().match(/^{/),
        },
        (err, found, ip): void => {
            if (found) {
                const instance = tools.findInstance(
                    options,
                    'fhem',
                    obj => obj.native.host === ip || obj.native.host === device._name,
                );

                if (instance) {
                    found = false;
                }

                if (found) {
                    options.newInstances.push({
                        _id: tools.getNextInstanceID('fhem', options),
                        common: {
                            name: 'fhem',
                            title: `FHEM (${name})`,
                        },
                        native: {
                            host: ip,
                            port: 7072,
                        },
                        comment: {
                            add: [`FHEM (${name})`],
                        },
                    });
                }
            }
            if (callback) {
                callback(null, found, ip);
                callback = null;
            }
        },
    );
}

export const type = 'ip'; // make type=serial for USB sticks
// The probe itself runs up to 500 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const FHEM_PROBE_TIMEOUT = 500;
export const timeout = FHEM_PROBE_TIMEOUT + 300;
