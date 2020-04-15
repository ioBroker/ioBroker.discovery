'use strict';

const tools = require('../tools.js');

function detect(ip, device, options, callback){
    tools.testPort(ip, 6600, 500, {
        onConnect: (ip, port, client) => {
            client.write('noidle\\n');
        },
        onReceive: (data) => data && ~data.toString().toLowerCase().indexOf('ok mpd')
    }, (err, found, ip) => {
        if (found){
            let instance = tools.findInstance(options, 'mpd', obj => obj.native.ip === ip);
            if (!instance){
                const id = tools.getNextInstanceID('mpd', options);
                instance = {
                    _id:        id, common: {
                        name:    'mpd',
                        enabled: true,
                        title:   obj => obj.common.title
                    }, comment: {
                        add: ['MPD Player ', ip]
                    }
                };
                options.newInstances.push(instance);
                instance.native = {
                    'ip':   ip,
                    'port': 6600
                };
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        }
        if (callback){
            callback(null, found, ip);
            callback = null;
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
