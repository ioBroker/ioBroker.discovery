'use strict';

const tools = require('../tools.js');

function addDevice(ip, device, options, callback) {

    let instance = tools.findInstance(options, 'lupusec', obj => obj.native.alarm_host === ip || obj.native.alarm_host === device._name);

    if (!instance) {

        const id = tools.getNextInstanceID('lupusec', options);
        const name = device._name ? device._name : '';

        tools.words['alarm_user'] = {
            'de': 'Lupusec Benutzer eingeben',
            'en': 'Lupusec username',
            'ru': 'Имя пользователя Lupusec',
            'pt': 'Nome de usuário do Lupusec',
            'nl': 'Lupusec-gebruikersnaam',
            'fr': "Nom d'utilisateur Lupusec",
            'it': 'Nome utente Lupusec',
            'es': 'Nombre de usuario de Lupusec',
            'pl': 'Nazwa użytkownika Lupusec',
            'zh-cn': 'Lupusec用户名'
        };

        tools.words['alarm_password'] = {
            'de': 'Lupusec Passwort für Benutzer eingeben',
            'en': 'Lupusec password for username',
            'ru': 'Lupusec пароль',
            'pt': 'Lupusec password for username',
            'nl': 'Lupusec-wachtwoord voor gebruikersnaam',
            'fr': "Mot de passe Lupusec pour le nom d'utilisateur",
            'it': 'Lupusec password per username',
            'es': 'Contraseña de Lupusec para nombre de usuario',
            'pl': 'Hasło Lupusec dla nazwy użytkownika',
            'zh-cn': '用户名的Lupusec密码'
        };

        instance = {
            _id: id,
            common: {
                name: 'lupusec',
                title: 'Lupusec (' + ip + (name ? (' - ' + name) : '') + ')'
            },
            native: {
                alarm_host: ip,
                alarm_port: 80,
                alarm_https: false
            },
            comment: {
                add: 'Lupusec (' + [name, ip] + ')',
                inputs: [{
                    name: 'native.alarm_user',
                    def: '',
                    type: 'text', // text, checkbox, number, select, password. Select requires
                    title: 'Lupusec Username' // tools.translate(options.language, 'alarm_user') // see translation in words.js
                },
                {
                    name: 'native.alarm_password',
                    def: '',
                    type: 'password', // text, checkbox, number, select, password. Select requires
                    title: 'Lupusec Password' // tools.translate(options.language, 'alarm_password') // see translation in words.js
                }
                    /*,
                     {
                     name: 'native.alarm_password_confirm',
                     def: '',
                     type: 'password', // text, checkbox, number, select, password. Select requires
                     title: 'Confirm Lupusec Password' // tools.translate(options.language, 'alarm_password') // see translation in words.js
                     }
                     */
                ]
            }
        };
        options.newInstances.push(instance);
        return callback(true);
    } else {
        callback(null, false, ip);
    }
}

// just check if IP exists
function detect(ip, device, options, callback){
    tools.httpGet('http://' + ip + '/action/logout', (err, data) => {
        if (err || !data){
            callback && callback(null, false, ip);
        } else if (data){
            let testData;
            try {
                testData = JSON.parse(data);
            } catch (e) {
                testData = null;
                callback && callback(null, false, ip);
            }
            if (testData && parseInt(testData.result, 10) === 1 && testData.message === '{WEB_MSG_SUBMIT_SUCCESS}'){
                addDevice(ip, device, options, callback);
            } else {
                callback && callback(null, false, ip);
            }
        } else {
            callback && callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip']; // make type=serial for USB sticks
