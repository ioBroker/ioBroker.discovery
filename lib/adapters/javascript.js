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
        'de': 'Stellt einen Editor zur Verfügung mit dem man Scripte erstellen kann. Folgende Sprachen werden Unterstützt: JavaScript, Typescript, Blockly',
        'ru': 'используется для создания правил',
        'pt': 'usado para criação de regras',
        'nl': 'gebruikt voor het maken van regels',
        'fr': 'utilisé pour la création de règles',
        'it': 'usato per la creazione di regole',
        'es': 'utilizado para la creación de reglas',
        'pl': 'używane do tworzenia reguł',
        'zh-cn': '用于规则创建'
    };
    tools.words['Javascript rules'] = {
        'en': 'Javascript rules',
        'de': 'Javascript Regeln',
        'ru': 'Javascript правила',
        'pt': 'Regras de Javascript',
        'nl': 'Javascript-regels',
        'fr': 'Règles Javascript',
        'it': 'Regole Javascript',
        'es': 'Reglas de Javascript',
        'pl': 'Reguły Javascript',
        'zh-cn': 'Javascript规则'
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
