'use strict';

const tools = require('../tools.js');
// based on miele
const adapterName = 'epson_stylus_px830';
const reIsEpsonPX830 = /<div class='tvboxlarge'>Epson Stylus Photo PX830<\/div>/;

function detect(ip, device, options, callback) {
    tools.httpGet('http://' + ip + '/actor.do', 1400, (err, data) => {
        if (!err && data && reIsEpsonPX830.test(data)) {
            let instance = tools.findInstance (options, adapterName, obj => true);
            if (!instance) {
                const name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID (adapterName, options),
                    common: {
                        name: adapterName,
                        title: 'Epson Stylus PX830 (' + ip + (name ? (' - ' + name) : '') + ')'
                    },
                    native: {
                        ip: ip
                    },
                    comment: {
                        add: [name, ip]
                    }
                };
                options.newInstances.push (instance);
                return callback (null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;