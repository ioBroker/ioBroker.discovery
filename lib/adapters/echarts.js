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
    tools.words['echarts adapter'] = {
        'en': 'eCharts adapter',
        'de': 'eCharts Adapter',
        'ru': 'eCharts драйвер',
        'pt': 'Adaptador de eCharts',
        'nl': 'eCharts-adapter',
        'fr': 'Adaptateur eCharts',
        'it': 'Adattatore eCharts',
        'es': 'Adaptador de eCharts',
        'pl': 'Adapter eCharts',
        'zh-cn': 'eCharts适配器'
    };

    let instance = tools.findInstance(options, 'history') || tools.findInstance(options, 'sql') || tools.findInstance(options, 'influxdb');
    if (instance) {
        instance = tools.findInstance(options, 'echarts');
        if (!instance) {
            // cloud required web instance so check and install it too
            let webInstance = tools.findInstance(options, 'web');

            const id = tools.getNextInstanceID('echarts', options);

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
                _id: tools.getNextInstanceID('echarts', options),
                common: {
                    name: 'echarts',
                    title: tools.translate(options.language, 'echarts adapter')
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
