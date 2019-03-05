'use strict';

const tools = require(__dirname + '/../tools.js');

function detect(ip, device, options, callback) {

    const ownip = tools.getOwnAddress(ip);
    let instance = tools.findInstance(options, 'yeelight-2');
    //const instance;

    tools.ssdpScan(ip, 'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + ownip + ':19140\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'ST: wifi_bulb\r\n', true, 30000, 1982,
        (err, data) => {
            if (data && !data['hue-bridgeid'] && !data['HUE-BRIDGEID']) {
                //options.log.warn(err);
                const name = ip + '(' + data.model + ')';

                if (!instance) {
                    instance = {
                        _id: tools.getNextInstanceID('yeelight-2', options),
                        common: {
                            name: 'yeelight-2',
                            enabled: true,
                            title: 'yeelight-2 (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                        },
                        native: {
                            devices: []
                        },
                        comment: {
                            add: []
                        }

                    };
                    options.newInstances.push(instance);
                }
                instance.native.devices.push({
                    name: data.id,
                    ip: ip,
                    port: '55443',
                    smart_name: '',
                    type: data.model
                });

                instance.comment.add.push(name);

                callback(null, true, ip);
            } else{
                callback(null, false, ip);
            }
        });
}

exports.detect = detect;
exports.type = ['ip']; // TODO check if upnp and location call