'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words["Fast Web-App for Visualization"] = {
            "en": "Fast Web-App for Visualization",
            "de": "Schnelle Web-App zur Visualisierung",
            "ru": "Быстрое веб-приложение для визуализации",
            "pt": "Fast Web-App para visualização",
            "nl": "Snelle web-app voor visualisatie",
            "fr": "Web-App rapide pour la visualisation",
            "it": "App Web veloce per visualizzazione",
            "es": "Rápida aplicación web para visualización",
            "pl": "Szybka aplikacja internetowa do wizualizacji",
            "zh-cn": "用于可视化的快速Web应用程序"
        };

    let instance = tools.findInstance(options, 'iqontrol');
    if (!instance) {
        // iqontrol requires web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web', obj => obj && obj.native);

        const id = tools.getNextInstanceID('iqontrol', options);

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
                name: 'iqontrol',
                title: 'iQontrol Vis'
            },
            native: {
                instance: webInstance._id
            },
            comment: {
                add: [tools.translate(options.language, 'Fast Web-App for Visualization')],
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
