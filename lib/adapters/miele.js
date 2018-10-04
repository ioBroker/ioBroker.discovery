'use strict';

const tools = require('../tools.js');

const adapterName = 'miele';
//const reIsMiele = /^<\?xml[\s\S]*?<DEVICES>[\s\S]*?<\/DEVICES>/;
const reIsMiele = /^<\?xml[\s\S]*?<DEVICES>[\s\S]*?\/homebus\/device[\s\S]*?<\/DEVICES>/;

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') return callback(null, false, ip);
    
    tools.httpGet('http://' + ip + '/homebus', (err, data) => {
        if (!err && data && reIsMiele.test(data)) {
            let instance = tools.findInstance(options, adapterName, obj => true);
            if (!instance) {
                const name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID(adapterName, options),
                    common: {
                        name: adapterName,
                        title: 'Miele (' + ip + (name ? (' - ' + name) : '') + ')'
                    },
                    native: {
                        ip: ip
                    },
                    comment: {
                        add: [name, ip]
                    }
                };
                options.newInstances.push(instance);
                return callback(null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
