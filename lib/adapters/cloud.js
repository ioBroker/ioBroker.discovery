'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used remote connection and for alexa'] = {
        'en': 'Provides the possibility to access the ioBroker at home from the internet via the ioBroker cloud. (Visualization for free, Admin/Editors Chargeable)',
        'de': 'Bietet die Möglichkeit, über die ioBroker-Cloud zu Hause vom Internet aus auf den ioBroker zuzugreifen. (Visualisierung kostenlos, Admin / Editoren kostenpflichtig)',
        'ru': 'Предоставляет возможность доступа к ioBroker дома из Интернета через облако ioBroker. (Визуализация бесплатно, администратор / редакторы платно)',
        'pt': 'Oferece a possibilidade de acessar o ioBroker em casa a partir da Internet por meio da nuvem ioBroker. (Visualização gratuita, cobrada por administradores / editores)',
        'nl': 'Biedt de mogelijkheid om thuis via internet toegang te krijgen tot de ioBroker via de ioBroker-cloud. (Gratis visualisatie, Admin / Editors betalend)',
        'fr': 'Offre la possibilité d\'accéder à ioBroker à la maison depuis Internet via le cloud ioBroker. (Visualisation gratuite, administrateur / éditeurs payants)',
        'it': 'Offre la possibilità di accedere all\'ioBroker da casa da Internet tramite il cloud ioBroker. (Visualizzazione gratuita, a pagamento per amministratori / editor)',
        'es': 'Ofrece la posibilidad de acceder a ioBroker en casa desde Internet a través de la nube de ioBroker. (Visualización gratis, administrador / editores con cargo)',
        'pl': 'Zapewnia możliwość dostępu do ioBroker w domu z Internetu poprzez chmurę ioBroker. (Bezpłatna wizualizacja, płatna przez administratora / redaktorów)',
        'zh-cn': '提供了通过ioBroker云从互联网在家访问ioBroker的可能性。 （可视化是免费的，管理员/编辑者需付费）'
    };
    tools.words['Cloud adapter'] = {
        'en': 'Cloud adapter',
        'de': 'Cloud Adapter',
        'ru': 'Cloud драйвер',
        'pt': 'Adaptador de nuvem',
        'nl': 'Cloud-adapter',
        'fr': 'Adaptateur de nuage',
        'it': 'Adattatore cloud',
        'es': 'Adaptador de nube',
        'pl': 'Adapter do chmury',
        'zh-cn': '云适配器'
    };
    tools.words['Get API-KEY here '] = {
        'en': 'Get API-KEY here ',
        'de': 'API-KEY hier bekommen ',
        'ru': 'Получить API-KEY здесь ',
        'pt': 'Obtenha aqui a API-KEY ',
        'nl': 'Verkrijg API-KEY hier ',
        'fr': 'Obtenez API-KEY ici ',
        'it': 'Ottieni API-KEY qui ',
        'es': 'Obtenga API-KEY aquí ',
        'pl': 'Uzyskaj tutaj klucz API ',
        'zh-cn': '在这里获取API-KEY '
    };
    tools.words['Input generated key below'] = {
        'en': 'Input generated key below',
        'de': 'Trage den generierten APP-Key unten ein',
        'ru': 'Введите сгенерированный ключ внизу',
        'pt': 'Entrada gerada chave abaixo',
        'nl': 'Ingangs gegenereerde sleutel hieronder',
        'fr': 'Entrée clé générée ci-dessous',
        'it': 'Input generato chiave qui sotto',
        'es': 'Clave de entrada generada a continuación',
        'pl': 'Wprowadź wygenerowany klucz poniżej',
        'zh-cn': '输入生成的密钥如下'
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
                        def: 'https://iobroker.pro/www/pricing',
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
exports.timeout = 100;
