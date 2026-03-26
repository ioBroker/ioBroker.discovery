'use strict';

const tools = require('../tools.js');

function detect(ip, device, options, callback) {
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
            onConnect: (ip, port, client) => {
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
        (err, found, ip) => {
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

exports.detect = detect;
exports.type = ['ip']; // make type=serial for USB sticks
exports.timeout = 500;
