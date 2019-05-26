'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['Simple WEB Server'] = {
        'en': 'Simple WEB Server',
        'de': 'Simple WEB Server',
        'ru': 'Simple WEB Сервер',
        "pt": "Servidor WEB Simples",
        "nl": "Eenvoudige WEB-server",
        "fr": "Serveur WEB simple",
        "it": "Semplice WEB Server",
        "es": "Servidor web simple",
        "pl": "Prosty serwer WWW",
        "zh-cn": "简单的WEB服务器"
    };
    tools.words['used for visualisations'] = {
        'en': 'used for visualisations',
        'de': 'wird für die Visualisierung benutzt',
        'ru': 'используется for visualisations',
        "pt": "usado para visualizações",
        "nl": "gebruikt voor visualisaties",
        "fr": "utilisé pour les visualisations",
        "it": "usato per le visualizzazioni",
        "es": "utilizado para visualizaciones",
        "pl": "używany do wizualizacji",
        "zh-cn": "用于可视化"
    };
    let instance = tools.findInstance(options, 'web');
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('web', options),
            common: {
                name: 'web',
                title: tools.translate(options.language, 'Simple WEB Server')
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'used for visualisations')],
                advice: true
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