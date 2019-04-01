'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used remote connection and for alexa'] = {
        'en': 'used remote connection and for alexa',
        'de': 'wird für die Verbindung aus dem Internet und für Alexa benutzt',
        'ru': 'используется для удалённого доступа и для Amazon Alexa',
        "pt": "conexão remota usada e para alexa",
        "nl": "gebruikte externe verbinding en voor alexa",
        "fr": "connexion à distance utilisé et pour alexa",
        "it": "connessione remota utilizzata e per alexa",
        "es": "conexión remota utilizada y para alexa",
        "pl": "używane połączenie zdalne i alexa",
        "zh-cn": "使用远程连接和alexa"
    };
    tools.words['Cloud adapter'] = {
        'en': 'Cloud adapter',
        'de': 'Cloud Adapter',
        'ru': 'Cloud драйвер',
        "pt": "Adaptador de nuvem",
        "nl": "Cloud-adapter",
        "fr": "Adaptateur de nuage",
        "it": "Adattatore cloud",
        "es": "Adaptador de nube",
        "pl": "Adapter do chmury",
        "zh-cn": "云适配器"
    };
    tools.words['Get API-KEY here '] = {
        'en': 'Get API-KEY here ',
        'de': 'API-KEY hier bekommen ',
        'ru': 'Получить API-KEY здесь ',
        "pt": "Obtenha aqui a API-KEY ",
        "nl": "Verkrijg API-KEY hier ",
        "fr": "Obtenez API-KEY ici ",
        "it": "Ottieni API-KEY qui ",
        "es": "Obtenga API-KEY aquí ",
        "pl": "Uzyskaj tutaj klucz API ",
        "zh-cn": "在这里获取API-KEY "
    };
    tools.words['Input generated key below'] = {
        'en': 'Input generated key below',
        'de': 'Trage generierten APP-Key daunten',
        'ru': 'Введите сгенерированный ключ внизу',
        "pt": "Entrada gerada chave abaixo",
        "nl": "Ingangs gegenereerde sleutel hieronder",
        "fr": "Entrée clé générée ci-dessous",
        "it": "Input generato chiave qui sotto",
        "es": "Clave de entrada generada a continuación",
        "pl": "Wprowadź wygenerowany klucz poniżej",
        "zh-cn": "输入生成的密钥如下"
    };
    let instance = tools.findInstance(options, 'cloud');
    if (!instance) {
        // cloud required web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web', obj => obj && obj.native && !obj.native.secure);

        const id = tools.getNextInstanceID('cloud', options);

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
                name: 'cloud',
                title: tools.translate(options.language, 'Cloud adapter')
            },
            native: {
                instance: webInstance._id
            },
            comment: {
                add: [tools.translate(options.language, 'used remote connection and for alexa')],
                advice: true,
                required: [webInstance._id],
                inputs: [
                    {
                        def: 'https://iobroker.net',
                        type: 'link',
                        title: tools.translate(options.language, 'Get API-KEY here ') // see translation in words.js
                    },
                    {
                        def: tools.translate(options.language, 'Input generated key below'),
                        type: 'comment',
                        title: ''
                    },
                    {
                        name: 'native.apikey',
                        def: '',
                        required: true,
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'API-KEY' // see translation in words.js
                    }
                ]
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
