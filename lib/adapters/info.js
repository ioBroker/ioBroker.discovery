'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used to get informations about your ioBroker'] = {
        "en": "used to get informations about your ioBroker",
        "de": "um Informationen über Ihren ioBroker zu erhalten",
        "ru": "используется для получения информации о вашем ioBroker",
        "pt": "usado para obter informações sobre o seu ioBroker",
        "nl": "gebruikt om informatie te krijgen over uw ioBroker",
        "fr": "utilisé pour obtenir des informations sur votre ioBroker",
        "it": "usato per ottenere informazioni sul tuo ioBroker",
        "es": "Se utiliza para obtener información sobre su ioBroker",
        "pl": "używane do uzyskiwania informacji o urządzeniu ioBroker",
        "zh-cn": "用于获取有关您的ioBroker的信息"
    };
    tools.words['Information page'] = {
        "en": "Information page",
        "de": "Informationsseite",
        "ru": "Информационная страница",
        "pt": "Página de informação",
        "nl": "Informatiepagina",
        "fr": "Page d'information",
        "it": "Pagina di informazioni",
        "es": "Página de información",
        "pl": "Strona informacyjna",
        "zh-cn": "信息页面"
    };

    let instance = tools.findInstance(options, 'info');
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('info', options),
            common: {
                name: 'info',
                title: tools.translate(options.language, 'Information page')
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'used to get informations about your ioBroker')],
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