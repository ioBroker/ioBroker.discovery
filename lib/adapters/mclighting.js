'use strict';

const tools = require('../tools.js');

function addInstance(ip, options, cb){
    let instance = tools.findInstance(options, 'mclighting', obj => obj.native.host === ip);
    if (!instance){
        const id = tools.getNextInstanceID('mclighting', options);
        instance = {
            _id:        id, common: {
                name: 'mclighting', 
                enabled: true, 
                title: obj => obj.common.title
            }, comment: {
                add: ['MC Lighting ', ip]
            }
        };
        options.newInstances.push(instance);
        instance.native = {
            "host": ip,
            "port": 80
        };
        cb && cb(true);
    } else {
        cb && cb(false);
    }
}

function detect(ip, device, options, callback){
    tools.httpGet('http://' + ip, 2000, (err, data) => {
        if (err || !data || ~data.indexOf('Unauthorized')){
            if (callback){
                callback(null, false, ip);
                callback = null;
            }
        } else {
            if (data && ~data.indexOf('Mc Lighting')){
                addInstance(ip, options, (state) => {
                    callback(null, state, ip);
                    callback = null;
                });
            } else {
                if (callback){
                    callback(null, false, ip);
                    callback = null;
                }
            }
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
