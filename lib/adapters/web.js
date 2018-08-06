'use strict';

var tools = require(__dirname + '/../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['Simple WEB Server'] = {
        'en': 'Simple WEB Server',
        'de': 'Simple WEB Server',
        'ru': 'Simple WEB Сервер'
    };
    tools.words['used for visualisations'] = {
        'en': 'used for visualisations',
        'de': 'wird für die Visualisierung benutzt',
        'ru': 'используется for visualisations'
    };
    var instance = tools.findInstance(options, 'web');
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