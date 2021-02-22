'use strict';

const tools = require('../tools.js');

tools.words['net tools'] = {
    'en': 'Provides ping, Wake-on-Lan and port scan.',
    'de': 'Stellt Ping, Wake-on-Lan und Port-Scan zur Verfügung.',
    'ru': 'Обеспечивает ping, Wake-on-Lan и сканирование портов.',
    'pt': 'Fornece ping, Wake-on-Lan e varredura de portas.',
    'nl': 'Biedt ping, Wake-on-Lan en poortscan.',
    'fr': 'Fournit ping, Wake-on-Lan et scan des ports.',
    'it': 'Fornisce ping, Wake-on-Lan e port scan.',
    'es': 'Proporciona ping, Wake-on-Lan y escaneo de puertos.',
    'pl': 'Zapewnia ping, Wake-on-Lan i skanowanie portów.',
    'zh-cn': '提供ping，局域网唤醒和端口扫描。'
};
// just check if IP exists
function detect(ip, device, options) {
    // options.newInstances
    // options.existingInstances
    // options.device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }

    if (ip === '127.0.0.1') {
        return false;
    }
    let instance;
    for (let j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === 'net-tools') {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (let i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'net-tools') {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                break;
            }
        }
    }

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('net-tools', options),
            common: {
                name: 'net-tools'
            },
            native: {
                devices: []
            },
            comment: {
                add: [tools.translate(options.language, 'net tools')],
                advice: false,
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }


}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
