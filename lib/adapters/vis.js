'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['web interface'] = {
        'en': 'Interface for tablets and desktops',
        'de': 'Interface für Tablets und Desktops',
        'ru': 'Инетфейс для планшетов и компьютеров',
        'pt': 'Interface para tablets e desktops',
        'nl': 'Interface voor tablets en desktops',
        'fr': 'Interface pour tablettes et ordinateurs de bureau',
        'it': 'Interfaccia per tablet e desktop',
        'es': 'Interfaz para tabletas y equipos de escritorio.',
        'pl': 'Interfejs dla tabletów i komputerów stacjonarnych',
        'zh-cn': '平板电脑和台式机的界面'
    };
    tools.words['used for visualisations'] = {
        'en': 'used for visualisations',
        'de': 'Stellt ein mächtiges Werkzeug für die Visalisierung zur Verfügung',
        'ru': 'используется for visualisations',
        'pt': 'usado para visualizações',
        'nl': 'gebruikt voor visualisaties',
        'fr': 'utilisé pour les visualisations',
        'it': 'usato per le visualizzazioni',
        'es': 'utilizado para visualizaciones',
        'pl': 'używany do wizualizacji',
        'zh-cn': '用于可视化'
    };
    let instance = tools.findInstance(options, 'vis');
    if (!instance) {
        // sonos required web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web');

        const id = tools.getNextInstanceID('vis', options);

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
                name: 'vis',
                title: tools.translate(options.language, 'web interface')
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'used for visualisations')],
                advice: true,
                license: 'CC BY-NC 4.0',
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
