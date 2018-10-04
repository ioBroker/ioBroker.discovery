'use strict';

const tools = require('../tools.js');
// based on miele
const adapterName = 'homepilot';
const reIsHomepilot = /<h1 id="form-container-automation-conflict-detection-title-resolve">/;

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') return callback(null, false, ip);
    
    tools.httpGet('http://' + ip + '/actor.do', (err, data) => {
        let ar;
        if (!err && data && reIsHomepilot.test(data)) {
            let instance = tools.findInstance (options, adapterName, obj => true);
            if (!instance) {
                const name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID (adapterName, options),
                    common: {
                        name: adapterName,
                        title: 'Homepilot (' + ip + (name ? (' - ' + name) : '') + ')'
                    },
                    native: {
                        ip: ip
                    },
                    comment: {
                        add: [name, ip]
                    }
                };
                options.newInstances.push(instance);
                return callback (null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
