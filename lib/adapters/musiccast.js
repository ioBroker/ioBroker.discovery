'use strict';

const tools = require('../tools.js');

const reyxcControl = /<yamaha:X_yxcControlURL>*.YamahaExtendedControl.*<\/yamaha:X_yxcControlURL>/i;
const reFriendlyName = /<friendlyName>([^<]*)<\/friendlyName>/;
const reModelName = /<modelName>([^<]*)<\/modelName>/i;
const reUniqueID = /<serialNumber>([^<]*)<\/serialNumber>/i; //same as getDeviceInfo:system_id

tools.words['used for Yamaha Musiccast devices'] = {
    "en": "used for Yamaha Musiccast devices",
    "de": "wird für Yamaha Musiccast-Geräte verwendet",
    "ru": "используется для устройств Yamaha Musiccast",
    "pt": "usado para dispositivos Yamaha Musiccast",
    "nl": "gebruikt voor Yamaha Musiccast-apparaten",
    "fr": "utilisé pour les appareils Yamaha Musiccast",
    "it": "usato per i dispositivi Yamaha Musiccast",
    "es": "utilizado para dispositivos Yamaha Musiccast",
    "pl": "używany do urządzeń Yamaha Musiccast",
    "zh-cn": "用于Yamaha Musiccast设备"
};


function detect(ip, device, options, callback) {
    
    tools.httpGet('http://' + ip + ':49154/MediaRenderer/desc.xml', (error, data) => {
        if (!error && data && reyxcControl.test(data)) {
            const model = reModelName.exec(data);
            const desc = reFriendlyName.exec(data);
            const uid = reUniqueID.exec(data);
            options.log.debug('found Yamaha Musiccast '+ model[1]+ '  '+desc[1]+'  '+uid[1]+' at '+ip );

            let instance = tools.findInstance (options, 'musiccast'); //one instance for all devices, no need to check the IP
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID ('musiccast', options ),
                    common: {
                        name: 'musiccast',
                        title: 'MusicCast Adapter one for all devices'
                    },
                    native: {
                    },
                    comment: {
                        add: [tools.translate(options.language, 'used for Yamaha Musiccast devices')],
                        advice: true,
                    }
                };
                options.newInstances.push (instance);
                return callback (null, true, ip);
            }
        }
        callback(null, false);
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
