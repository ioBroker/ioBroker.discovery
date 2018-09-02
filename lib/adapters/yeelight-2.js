var tools = require(__dirname + '/../tools.js');
const dgram = require('dgram');
const usedPorts = [];

function detect(ip, device, options, callback) {

    ownip = tools.getOwnAddress(ip);
    var instance = tools.findInstance(options, 'yeelight-2');
    //var instance;

    tools.ssdpScan(ip, 'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + ownip + ':19140\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'ST: wifi_bulb\r\n', true, 30000,1982,
        function (err, data) {
            if (data) {
                //options.log.warn(err);
                var name = ip + '(' + data.model + ')';

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
                    port: "55443",
                    smart_name: '',
                    type: data.model
                });

                instance.comment.add.push(name);

                callback(null, true, ip);
            }
            else{
                callback(null, false, ip);
            }

        });

}

exports.detect = detect;
exports.type = ['ip'];