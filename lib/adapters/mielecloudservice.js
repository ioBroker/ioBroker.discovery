'use strict';

// Version 1.0.0 of mielecloudservice lib in discovery

const tools = require('../tools.js');

const adapterName = 'mielecloudservice';
const reIsMieleXGW3000 = /^<\?xml[\s\S]*?<DEVICES>[\s\S]*?\/homebus\/device[\s\S]*?<\/DEVICES>/;


function detect(ip, device, options, callback) {
    // options.log.debug("MieleCloudService => device=" + JSON.stringify(device));
    // Miele devices may only be detected via ip & mdns - so quick fail if none of these services
    if ( (device._source !== 'ip') && (device._source !== 'mdns') ) {
        return callback(null, false, ip);
    }

    let detected   = false;
    let deviceName = 'Miele Appliance';

    if (device._source === 'ip') {
        tools.httpGet('http://' + ip + '/homebus', (err, data) => {
            if (!err && data && ( reIsMieleXGW3000.test(data) ) ){
                detected   = true;
                deviceName = device.name;
            }
        });
    } else {
        // detection via mdns
        // options.log.debug('device._mdns.PTR: [' + device._mdns.PTR.data + ']');
        if (device._mdns.PTR.data && ('_mieleathome._tcp.local' === device._mdns.PTR.data)) {
            // options.log.debug('Found by PTR: [' + device._mdns.A.name + ']')
            detected   = true;
            deviceName = device._mdns.A.name;
        }
    }
    if ( detected ) {
        let instance = tools.findInstance(options, adapterName, obj => true);
        if (!instance) {
            instance = {
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: 'Miele (' + ip + (deviceName ? (' - ' + deviceName) : '') + ')'
                },
                native: {
                    ip: ip
                },
                comment: {
                    add: [deviceName, ip]
                }
            };
            options.newInstances.push(instance);
            return callback(null, true, ip);
        }
    }  else {
        return callback(null, false, ip);
    }
}


module.exports = {
    detect,
    type: ['mdns', 'ip'],
    timeout: 1500
};