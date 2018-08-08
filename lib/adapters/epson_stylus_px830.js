'use strict';

var tools = require('../tools.js');
// based on miele
var adapterName = 'epson_stylus_px830';
var reIsEpsonPX830 = /<div class='tvboxlarge'>Epson Stylus Photo PX830<\/div>/;

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') return callback(null, false, ip);
    
    tools.httpGet('http://' + ip + '/actor.do', function (err, data) {
        var ar;
        if (!err && data && reIsEpsonPX830.test(data)) {
            var instance = tools.findInstance (options, adapterName, function (obj) {
                return true;
            });
            if (!instance) {
                var name = device._name ? device._name : '';
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
