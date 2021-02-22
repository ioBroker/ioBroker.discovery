'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for visualisations'] = {
        'en': 'used for visualisations',
        'de': 'Stellt ein Werkzeug zur Visualisierung bereit, mit dem sich eine Visualisierung erstellen lässt die auf verscheidenen Geräten angezeigt werden kann.',
        'ru': 'используется for visualisations',
        'pt': 'usado para visualizações',
        'nl': 'gebruikt voor visualisaties',
        'fr': 'utilisé pour les visualisations',
        'it': 'usato per le visualizzazioni',
        'es': 'utilizado para visualizaciones',
        'pl': 'używany do wizualizacji',
        'zh-cn': '用于可视化'
    };

    let instance = tools.findInstance(options, 'jarvis');
    if (!instance) {
        // jarvis requires web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web', obj => obj && obj.native);

        const id = tools.getNextInstanceID('jarvis', options);

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
                name: 'jarvis',
                title: 'jarvis - just another remarkable vis'
            },
            native: {
                instance: webInstance._id
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
exports.timeout = 100;
