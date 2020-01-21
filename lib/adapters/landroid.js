'use strict';

const tools = require('../tools.js');

function addDevice(ip, device, options, callback) {

    let instance = tools.findInstance(options, 'landroid', obj =>
        obj.native.ip === ip || obj.native.ip === device._name);

    if (!instance) {
        tools.words['pinCode'] = {
            'de': 'Vierstellige PIN des Rasenmähers eingeben',
            'en': 'Four-digit PIN of lawn mower',
            'ru': 'Четыре-значный PIN-код газонокосилки',
            'pt': 'PIN de quatro dígitos do cortador de grama',
            'nl': 'Viercijferige pincode van grasmaaier',
            'fr': 'NIP à quatre chiffres de la tondeuse à gazon',
            'it': 'PIN a quattro cifre della falciatrice',
            'es': 'PIN de cuatro dígitos de la cortadora de césped',
            'pl': 'Czterocyfrowy kod PIN kosiarki',
            'zh-cn': '割草机的四位数PIN'
        };

        instance = {
            _id: tools.getNextInstanceID('landroid', options),
            common: {
                name: 'landroid',
                title: 'Worx Landroid mower adapter (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
            },
            native: {
                ip: ip
            },
            comment: {
                add: [ip],
                inputs: [
                    {
                        name: 'native.pin',
                        def: '',
                        type: 'password', // text, checkbox, number, select, password. Select requires
                        title: tools.translate(options.language, 'pinCode') // see translation in words.js
                    }
                ]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }

    tools.httpGet('http://' + ip + ':80/jsondata.cgi', (err, data) => {
        if (err) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            let testData;
            try {
                testData = JSON.parse(data);
            } catch (e) {
                testData = null;
            }
            if (testData && testData.hasOwnProperty('percent_programmatore') && testData.hasOwnProperty('enab_bordo')) {
                addDevice(ip, device, options, callback);
            } else if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        }
    });
}
exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
