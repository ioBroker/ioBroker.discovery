import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
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

    // try to test TCP ports 2000, 2001, 2002
    let count = 0;
    // test hs485d
    let someFound = false;
    const name = ip + (device._name ? ` - ${device._name}` : '');

    // InfluxDB HTTP
    //TODO: HTTPS and Auth
    count++;
    tools.testPort(
        ip,
        8086,
        {
            onConnect: (ip, port, client): void => {
                //options.log.debug('Got connection to InfluxDB on ' + ip + ':' + port);
                client.write(
                    `GET /query?q=SHOW%20DATABASES HTTP/1.1\r\n` +
                        `User-Agent: NodeJS XML-RPC Client\r\n` +
                        `Accept: */*\r\n` +
                        `Host: ${ip}:${port}\r\n` +
                        `\r\n`,
                );
            },
            onReceive: data =>
                //options.log.debug('Got data from InfluxDB on ' + ip + ':' + port + ': ' + data);
                data && !!data.toString().match(/X-Influxdb-Version: [.\d]+/g),
        },
        (err, found, ip): void => {
            if (found) {
                const instance = tools.findInstance(options, 'influxdb', function (obj): boolean {
                    return obj.native.host === ip;
                });
                if (instance) {
                    found = false;
                }

                if (found) {
                    options.newInstances.push({
                        _id: tools.getNextInstanceID('influxdb', options),
                        common: {
                            name: 'influxdb',
                            title: `InfluxDB (${name})`,
                        },
                        native: {
                            host: ip,
                        },
                        comment: {
                            add: [`InfluxDB (${name})`],
                            /*                        inputs: [
                            {
                                name: 'native.user',
                                def: '',
                                type: 'text', // text, checkbox, number, select, password. Select requires
                                title: 'user' // see translation in words.js
                            },
                            {
                                name: 'native.password',
                                def: '',
                                type: 'password',
                                title: 'password' // see translation in words.js
                            }
                        ]*/
                        },
                    });
                    someFound = true;
                }
            }
            !--count && callback(null, someFound, ip);
        },
    );
}

export const type = ['ip']; // make type=serial for USB sticks
export const timeout = 700;
