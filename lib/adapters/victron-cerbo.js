'use strict';

const dns = require('node:dns');
const tools = require('../tools.js');

const adapterName = 'victron-cerbo';
const MQTT_PORT = 1883;
const HOSTNAMES = ['venus.local', 'cerbo.local', 'cerbogx.local'];

function detect(ip, device, options, callback) {
    let resolved = false;
    let pending = HOSTNAMES.length;

    const done = () => {
        if (!--pending && !resolved) {
            callback(null, false, ip);
        }
    };

    for (const hostname of HOSTNAMES) {
        dns.lookup(hostname, { family: 4 }, (err, address) => {
            if (resolved) {
                return;
            }
            if (err || !address) {
                return done();
            }

            options.log.debug(`${adapterName}: ${hostname} resolved to ${address}`);

            // Verify MQTT port is open
            tools.testPort(address, MQTT_PORT, 2000, (err, found) => {
                if (resolved) {
                    return;
                }
                if (!found) {
                    return done();
                }

                resolved = true;

                // Check if instance already exists for this host
                const instance = tools.findInstance(options, adapterName, obj => obj.native.host === address);
                if (instance) {
                    options.log.debug(`${adapterName}: instance already exists for ${address}`);
                    callback(null, false, ip);
                    return;
                }

                options.log.info(`${adapterName}: Victron device found at ${address} (${hostname})`);
                options.newInstances.push({
                    _id: tools.getNextInstanceID(adapterName, options),
                    common: {
                        name: adapterName,
                        title: `Victron Cerbo GX (${address})`,
                    },
                    native: {
                        host: address,
                    },
                    comment: {
                        add: [`Victron Cerbo GX (${hostname} / ${address})`],
                    },
                });
                callback(null, true, ip);
            });
        });
    }
}

module.exports = {
    detect,
    type: ['once'],
    timeout: 5000,
};
