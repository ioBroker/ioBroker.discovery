'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for rules creation'] = {
        'en': 'used for rules creation',
        'de': 'wird für die Regeln benutzt',
        'ru': 'используется для создания правил'
    };
    tools.words['Javascript rules'] = {
        'en': 'Javascript rules',
        'de': 'Javascript Regeln',
        'ru': 'Javascript правила'
    };

    let instance = tools.findInstance(options, 'javascript');
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('javascript', options),
            common: {
                name: 'javascript',
                title: tools.translate(options.language, 'Javascript rules')
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'used for rules creation')],
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