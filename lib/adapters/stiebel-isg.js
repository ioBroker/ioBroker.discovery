const tools = require('../tools.js');
const http = require('http');

function detect(ip, device, options, callback) {
    tools.get('http://' + ip, 1500, (err, data) => {
        if (data && data.indexOf('alt="Servicewelt"') !== -1) {
            let instance = tools.findInstance(options, 'stiebel-isg', obj => obj.native.isgAddress === ip);

            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('stiebel-isg', options),
                    common: {
                        name: 'stiebel-isg',
                        title: 'stiebel-isg (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        isgAddress: ip
                    },
                    comment: {
                        add: ['stiebel-isg (' + ip + ')']
                    }
                };
                options.newInstances.push(instance);
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        } else {
            callback(err, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
exports.timeout = 1500;