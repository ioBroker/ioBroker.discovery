'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for charts'] = {
        'en': 'used for charts',
        'de': 'Ein Werkzeug um Daten als Diagramme dar zu stellen.',
        'ru': 'используется для графиков',
        'pt': 'usado para gráficos',
        'nl': 'gebruikt voor grafieken',
        'fr': 'utilisé pour les graphiques',
        'it': 'usato per i grafici',
        'es': 'utilizado para gráficos',
        'pl': 'używane do wykresów',
        'zh-cn': '用于图表'
    };
    tools.words['flot adapter'] = {
        'en': 'Flot adapter',
        'de': 'Flot Adapter',
        'ru': 'Flot драйвер',
        'pt': 'Adaptador de Flot',
        'nl': 'Flot-adapter',
        'fr': 'Adaptateur Flot',
        'it': 'Adattatore flottante',
        'es': 'Adaptador de la mancha',
        'pl': 'Adapter Flot',
        'zh-cn': 'Flot适配器'
    };

    let instance = tools.findInstance(options, 'history') || tools.findInstance(options, 'sql') || tools.findInstance(options, 'influxdb');
    if (instance) {
        instance = tools.findInstance(options, 'flot');
        if (!instance) {
            // cloud required web instance so check and install it too
            let webInstance = tools.findInstance(options, 'web');

            const id = tools.getNextInstanceID('flot', options);

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
                _id: tools.getNextInstanceID('flot', options),
                common: {
                    name: 'flot',
                    title: tools.translate(options.language, 'flot adapter')
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'used for charts')],
                    required: [webInstance._id],
                    advice: true
                }
            };
            options.newInstances.push(instance);
            callback(null, true, instance._id.substring('system.adapter.'.length));
            return;
        }
    }
    callback(null, false);
}

exports.detect = detect;
exports.type = 'advice';// make type=serial for USB sticks
