'use strict';

const tools = require('../tools.js');

const reyxcControl = /<yamaha:X_yxcControlURL>*.YamahaExtendedControl.*<\/yamaha:X_yxcControlURL>/i;
const reFriendlyName = /<friendlyName>([^<]*)<\/friendlyName>/;
const reModelName = /<modelName>([^<]*)<\/modelName>/i;
const reUniqueID = /<serialNumber>([^<]*)<\/serialNumber>/i; //same as getDeviceInfo:system_id

function detect(ip, device, options, callback) {
    tools.httpGet('http://' + ip + ':49154/MediaRenderer/desc.xml', (error, data) => {
        if (!error && data && reyxcControl.test(data)) {
            const model = reModelName.exec(data);
            const desc = reFriendlyName.exec(data);
            const uid = reUniqueID.exec(data);

            let instance = tools.findInstance (options, 'musiccast');
            if (!instance) {
                let name = desc[1];
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
exports.timeout = 1500;
