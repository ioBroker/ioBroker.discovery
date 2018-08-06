'use strict';

var tools = require(__dirname + '/../tools.js');

var adapterName = 'miele';
//var reIsMiele = /^<\?xml[\s\S]*?<DEVICES>[\s\S]*?<\/DEVICES>/;
var reIsMiele = /^<\?xml[\s\S]*?<DEVICES>[\s\S]*?\/homebus\/device[\s\S]*?<\/DEVICES>/;

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') return callback(null, false, ip);
    
    tools.httpGet('http://' + ip + '/homebus', function (err, data) {
        var ar;
        if (!err && data && reIsMiele.test(data)) {
            var instance = tools.findInstance (options, adapterName, function (obj) {
                return true;
            });
            if (!instance) {
                var name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID (adapterName, options),
                    common: {
                        name: adapterName,
                        title: 'Miele (' + ip + (name ? (' - ' + name) : '') + ')'
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
