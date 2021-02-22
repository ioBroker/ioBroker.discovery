'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['assistants and services'] = {
        'en': 'Provides the possibility to connect assistants like Alexaa, Google, Alisa or services like IFTTT with the ioBroker. (Chargeable)',
        'de': 'Bietet die Möglichkeit, Assistenten wie Alexa, Google, Alisa oder Dienste wie IFTTT mit dem ioBroker zu verbinden. (Kostenpflichtig)',
        'ru': 'Предоставляет возможность подключать помощников, таких как Alexa, Google, Alisa или такие службы, как IFTTT, с ioBroker. (Платно)',
        'pt': 'Oferece a possibilidade de conectar assistentes como Alexa, Google, Alisa ou serviços como IFTTT com o ioBroker. (Cobrável)',
        'nl': 'Biedt de mogelijkheid om assistenten zoals Alexa, Google, Alisa of diensten zoals IFTTT te verbinden met de ioBroker. (Betalend)',
        'fr': 'Offre la possibilité de connecter des assistants comme Alexa, Google, Alisa ou des services comme IFTTT avec ioBroker. (Payant)',
        'it': 'Offre la possibilità di connettere assistenti come Alexa, Google, Alisa o servizi come IFTTT con ioBroker. (A pagamento)',
        'es': 'Brinda la posibilidad de conectar asistentes como Alexa, Google, Alisa o servicios como IFTTT con ioBroker. (Cobrable)',
        'pl': 'Zapewnia możliwość połączenia asystentów, takich jak Alexa, Google, Alisa lub usług takich jak IFTTT, z ioBrokerem. (Podlegający opłacie)',
        'zh-cn': '提供将Alexa，Google，Alisa等助手或IFTTT等服务与ioBroker连接的可能性。 （收费）'
    };
    tools.words['IoT adapter'] = {
        'en': 'IoT Adapter',
        'de': 'IoT-Adapter',
        'ru': 'IoT адаптер',
        'pt': 'Adaptador IoT',
        'nl': 'IoT-adapter',
        'fr': 'Adaptateur IoT',
        'it': 'Adattatore IoT',
        'es': 'Adaptador de IoT',
        'pl': 'Adapter IoT',
        'zh-cn': '物联网适配器'
    };
    tools.words['Sign up'] = {
        'en': 'Sign up',
        'de': 'Anmelden',
        'ru': 'Подписаться',
        'pt': 'Inscrever-se',
        'nl': 'Aanmelden',
        'fr': "S'inscrire",
        'it': 'Iscriviti',
        'es': 'Inscribirse',
        'pl': 'Zapisz się',
        'zh-cn': '注册'
    };
    let instance = tools.findInstance(options, 'iot');
    if (!instance) {

        const id = tools.getNextInstanceID('iot', options);

        instance = {
            _id: id,
            common: {
                name: 'iot',
                title: tools.translate(options.language, 'IoT adapter')
            },
            native: {

            },
            comment: {
                add: [tools.translate(options.language, 'assistants and services')],
                advice: true,
                inputs: [
                    {
                        def: 'https://iobroker.pro/www/pricing',
                        type: 'link',
                        title: tools.translate(options.language, 'Sign up') // see translation in words.js
                    },
                    {
                        name: 'native.login',
                        def: '',
                        required: true,
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'Email' // see translation in words.js
                    },
                    {
                        name: 'native.pass',
                        def: '',
                        required: true,
                        type: 'password', // text, checkbox, number, select, password. Select requires
                        title: 'password' // see translation in words.js
                    },
                    {
                        name: 'native.amazonAlexa',
                        def: '',
                        required: true,
                        type: 'checkbox', // text, checkbox, number, select, password. Select requires
                        title: 'Amazon Alexa' // see translation in words.js
                    },
                    {
                        name: 'native.googleHome',
                        def: '',
                        required: true,
                        type: 'checkbox', // text, checkbox, number, select, password. Select requires
                        title: 'Google Home' // see translation in words.js
                    },
                    {
                        name: 'native.yandexAlisa',
                        def: '',
                        required: true,
                        type: 'checkbox', // text, checkbox, number, select, password. Select requires
                        title: 'Yandex Alisa' // see translation in words.js
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
