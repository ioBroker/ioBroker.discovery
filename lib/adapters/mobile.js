'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['mobile interface'] = {
        'en': 'mobile interface',
        'de': 'Mobile Interface',
        'ru': 'Инетфейс для мобильных телефонов',
        "pt": "interface móvel",
        "nl": "mobiele interface",
        "fr": "interface mobile",
        "it": "interfaccia mobile",
        "es": "interfaz móvil",
        "pl": "interfejs mobilny",
        "zh-cn": "移动界面"
    };
    tools.words['used for visualisations'] = {
        'en': 'used for visualisations',
        'de': 'wird für die Visualisierung benutzt',
        'ru': 'используется для визуализации',
        "pt": "usado para visualizações",
        "nl": "gebruikt voor visualisaties",
        "fr": "utilisé pour les visualisations",
        "it": "usato per le visualizzazioni",
        "es": "utilizado para visualizaciones",
        "pl": "używany do wizualizacji",
        "zh-cn": "用于可视化"
    };
    let instance = tools.findInstance(options, 'mobile');
    if (!instance) {
        // sonos required web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web');

        const id = tools.getNextInstanceID('mobile', options);

        if (!webInstance) {
            webInstance = {
                _id: tools.getNextInstanceID('web', options),
                common: {
                    name: 'web',
                    title: 'ioBroker web Adapter'
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))]
                }
            };
            options.newInstances.push(webInstance);
        }

        instance = {
            _id: id,
            common: {
                name: 'mobile',
                title: tools.translate(options.language, 'mobile interface')
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'used for visualisations')],
                advice: true,
                required: [webInstance._id]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, instance._id.substring('system.adapter.'.length));
    } else {
        callback(null, false);
    }
}

exports.detect = detect;
exports.type = 'advice';// make type=serial for USB sticks
