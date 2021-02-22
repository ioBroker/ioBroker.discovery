'use strict';

const tools = require('../tools.js');

const reModelName = /FRITZ!Box/i;


tools.words['used for DECT devices on FRITZ!Box'] = {
    'en': 'used for DECT devices on FRITZ!Box',
    'de': 'Stellt die Verbindung zur Fritz!Box her und ermöglicht die Steuerung der angemeldeten DECT Geräte.',
    'ru': 'используется для устройств DECT на FRITZ! Box',
    'pt': 'usado para dispositivos DECT na FRITZ! Box',
    'nl': 'gebruikt voor DECT-apparaten op FRITZ! Box',
    'fr': 'utilisé pour les appareils DECT sur FRITZ! Box',
    'it': 'utilizzato per dispositivi DECT su FRITZ! Box',
    'es': 'utilizado para dispositivos DECT en FRITZ! Box',
    'pl': 'używany do urządzeń DECT w FRITZ! Box',
    'zh-cn': '用于FRITZ！Box上的DECT设备'
};


function detect(ip, device, options, callback) {

    tools.httpGet('http://' + ip + ':49000/MediaServerDevDesc.xml', (error, data) => {

        if (!error && data && reModelName.test(data)) {
            let instance = tools.findInstance (options, 'fritzdect');
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID ('fritzdect', options ),
                    common: {
                        name: 'fritzdect',
                        title: 'FritzDect adapter for FritzBox with DECT devices'
                    },
                    native: {
                    },
                    comment: {
                        add: [tools.translate(options.language, 'used for DECT devices on FRITZ!Box')],
                        advice: false,
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
