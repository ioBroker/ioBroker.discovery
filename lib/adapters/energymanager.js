'use strict';

const tools = require(__dirname + '/../tools.js');

function detect(ip, device, options, callback) {
    tools.httpGet('http://' + ip + '/rest/kiwigrid/wizard/devices', 1400, (err, data) => {
        if (err == null && data && data.indexOf('urn:kiwigrid:') !== -1) {
            //const managerData = JSON.parse(body);
            //if (managerData.hasOwnProperty("result")){
            let instance = tools.findInstance(options, 'energymanager', obj => obj.native.managerAddress === ip);
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('energymanager', options),
                    common: {
                        name: 'energymanager',
                        title: 'energymanager (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        managerAddress: ip
                    },
                    comment: {
                        add: ['energymanager (' + ip + ')']
                    }
                };
                options.newInstances.push(instance);
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        } else {
            callback(err, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
exports.timeout = 1500;