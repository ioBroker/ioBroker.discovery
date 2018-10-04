'use strict';

const tools = require('../tools.js');

function detect(ip, device, options, callback) {
    'use strict';
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    let waiting = false;
    const foundNutServer = {};

    tools.testPort(ip, 3493, {
        onConnect: (ip, port, client) => {
            options.log.debug('Got connection to NUT on ' + ip + ':' + port);
            client.write('LIST UPS\n');
        },
        onReceive: (data, ip, port, client) => {
            if (!data) return false;
            if (Buffer.isBuffer(data)) data = data.toString();
            if (typeof data !== 'string') return false;
            options.log.debug('Got response from NUT on ' + ip + ':' + port + ' = ' + JSON.stringify(data));
            if (!waiting && (data.indexOf('BEGIN') === 0)) {
                waiting = true;
            }

            const consts = {};
            const data_array = data.split('\n');
    		const re = /^UPS\s+(.+)\s+"(.+)"/;
    		for (let i = 0; i < data_array.length - 1; i++) {
    			const line = data_array[i];
                if (line.indexOf('UPS ') === 0) {
    				const matches = re.exec(line);
    				consts[matches[1]] = matches[2];
                    options.log.debug('Detected UPS ' + matches[1] + '@' + ip + ': ' + matches[2]);
    			} else if (line.indexOf('END ') === 0) {
                    waiting = false;
                }
            }
            if (Object.keys(consts).length) {
                foundNutServer[ip] = consts;
                if (waiting) return null;
                return true;
            }
            if (waiting) return null;
            return false;
        }
    }, (err, found, ip, port) => {
        waiting = false;
        if (found) {
            let foundNew = false;
            for (const foundUps in foundNutServer[ip]) {
                if (!foundNutServer[ip].hasOwnProperty(foundUps)) continue;

                let instance = tools.findInstance(options, 'nut', obj => {
                    //TODO handling 127.0.0.1 vs other IP
                    const matchFound = ((obj.native.host_ip === ip || obj.native.host_ip === device._name) && obj.native.host_port === 3493 && obj.native.ups_name === foundUps);
                    options.log.debug('Check existing NUT instances for UPS ' + foundUps + '@' + ip + ':' + matchFound);
                    return matchFound;
                });

                if (!instance) {
                    foundNew = true;
                    const name = foundUps + '@' + ip + ' (' + foundNutServer[ip][foundUps] + ')';
                    instance = {
                        _id: tools.getNextInstanceID('nut', options),
                        common: {
                            name: 'nut',
                            title: 'Network UPS Adapter (' + name + ')'
                        },
                        native: {
                            host_ip: ip,
                            host_port: 3493,
                            ups_name: foundUps
                        },
                        comment: {
                            add: [name]
                        }
                    };
                    options.newInstances.push(instance);
                    options.log.debug('Add new NUT Instance');
                }
            }
            callback(null, foundNew, ip);
        } else {
            callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks
exports.timeout = 1500;
