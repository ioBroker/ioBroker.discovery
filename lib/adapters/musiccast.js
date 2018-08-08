'use strict';

var tools = require('../tools.js');

var reyxcControl = /<yamaha:X_yxcControlURL>*.YamahaExtendedControl.*<\/yamaha:X_yxcControlURL>/i;
var reFriendlyName = /<friendlyName>([^<]*)<\/friendlyName>/;
var reModelName = /<modelName>([^<]*)<\/modelName>/i;
var reUniqueID = /<serialNumber>([^<]*)<\/serialNumber>/i; //same as getDeviceInfo:system_id

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') return callback(null, false, ip);
    
    tools.httpGet('http://' + ip + ':49154/MediaRenderer/desc.xml', function (error, data) {
        if (!error && data && reyxcControl.test(data)) {
            var model = reModelName.exec(data);
            var desc = reFriendlyName.exec(data);
            var uid = reUniqueID.exec(data);

            var instance = tools.findInstance (options, 'musiccast');
            if (!instance) {
                var name = desc[1];
                name = name || device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID ('musiccast', options),
                    common: {
                        name: 'musiccast',
                        title: 'MusicCast (' + ip + (name ? (' - ' + name) : '') + ')'
                    },
                    native: {
                        ip: ip,
                        type: model[1],
                        uid: uid[1],
                        name: desc[1]
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
