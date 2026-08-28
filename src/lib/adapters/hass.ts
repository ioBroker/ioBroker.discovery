import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }

    // try to test TCP ports 8123
    const name = ip + (device._name && device._name !== ip ? ` - ${device._name}` : '');

    tools.testPort(
        ip,
        8123,
        500,
        {
            onConnect: (ip, port, client): void => {
                client.write(
                    `GET /api/ HTTP/1.1\r
User-Agent: NodeJS Client\r
Content-Type: application/json\r
Accept: application/json\r
Accept-Charset: UTF8\r
Connection: Keep-Alive\r
Content-Length: 98\r
Host: ${ip}:${port}\r
\r
`,
                );
            },
            onReceive: data => data && !!data.toString().match(/API running\./),
        },
        (err, found, ip): void => {
            if (found) {
                const instance = tools.findInstance(
                    options,
                    'hass',
                    obj => obj.native.host === ip || obj.native.host === device._name,
                );

                if (instance) {
                    found = false;
                }

                if (found) {
                    options.newInstances.push({
                        _id: tools.getNextInstanceID('hass', options),
                        common: {
                            name: 'hass',
                            title: `Home Assistant (${name})`,
                        },
                        native: {
                            host: ip,
                            port: 8123,
                        },
                        comment: {
                            add: [`Home Assistant (${name})`],
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

export const type = ['ip']; // make type=serial for USB sticks
// The probe itself runs up to 500 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const HASS_PROBE_TIMEOUT = 500;
export const timeout = HASS_PROBE_TIMEOUT + 300;
