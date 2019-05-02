'use strict';

const tools = require('../tools.js');
const adapterName = 'g-homa';

function addInstance(ip, device, options, callback) {
    // Try to find an existing instance for this IP
    const instance = tools.findInstance(options, adapterName, obj => true); //obj && obj.native && ...
    if (!instance) {
        const id = tools.getNextInstanceID(adapterName, options);
        options.newInstances.push({
            _id: id,
            common: {
                name: adapterName
            },
            native: {},
            comment: {
                add: [tools.translate(options.language, 'Required for %s', 'G-Homa plugs')]
            }
        });
        callback(true);
    } else {
        callback(false);
    }
}

function detect(ip, device, options, callback) {
    // We need to have _hf_lpb100 data with existing networkSettings
    if (!device._hf_lpb100
        || !device._hf_lpb100.networkSettings
        || !tools.startsWith(device._hf_lpb100.networkSettings, 'TCP,Client')
    ) {
        return callback(null, false, ip);
    }

    addInstance(ip, device, options, callback);
}

module.exports = {
    detect,
    type: ['hf-lpb100'],
    timeout: 1500
};
