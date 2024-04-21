'use strict';

const tools = require('../tools.js');
const adapterName = 'air-q';

function addInstance(ip, options) {

    let instance = tools.findInstance(options, adapterName, obj =>
        obj && obj.native && (obj.native.ip === ip));

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: 'air-q',
                title: 'air-Q'
            },
            encryptedNative: [
                'password'
            ],
            protectedNative: [
                'password'
            ],
            native: {
                'password': '',
                ip: ip
            },
            instanceObjects: [
                {
                    _id: 'sensors',
                    type: 'device',
                    common: {
                        name: ''
                    },
                    native: {}
                },
                {
                    _id: 'info',
                    type: 'channel',
                    common: {
                        name: 'Information'
                    },
                    native: {}
                },
                {
                    _id: 'info.connection',
                    type: 'state',
                    common: {
                        role: 'indicator.connected',
                        name: 'Device connected',
                        type: 'boolean',
                        read: true,
                        write: false,
                        def: false
                    },
                    native: {}
                }
            ],
            comment: {
                add: ['used to read air-Q data'],
            }
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

function detect(ip, device, options, callback) {
    const getDnsNames= device._dns?.hostnames;
    let found = false;

    if(!getDnsNames){
        return callback(null, false, ip);
    }else{
        found = getDnsNames[0].includes(adapterName);
    }
   
    if (!found) {
        return callback(null, false, ip);
    }
    addInstance(ip, options);
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
