'use strict';

const tools = require('../tools.js');
const dns = require('dns');
const adapterName = 'klf200';

function startsWithVELUX_KLF_LAN(str) {
    return /^VELUX_KLF_LAN_/.test(str);
}

function isHttpTcpLocal(str) {
    return /\._http\._tcp\.local$/.test(str);
}

function addInstance(ip, hostname, device, options, callback) {
    // Try to find an existing instance for this IP
    const instance = tools.findInstance(options, adapterName, obj =>
        obj && obj.native && (obj.native.host === ip || obj.native.host.localeCompare(hostname, undefined, {sensitivity: 'base'}) === 0));

    if (!instance) {
        const id = tools.getNextInstanceID(adapterName, options);
        options.newInstances.push({
            _id: id,
            common: {
                name: adapterName
            },
            native: {
                host: hostname,
                password: '',
                enableAutomaticReboot: false,
                automaticRebootCronTime: '0 3 * * *',
            },
            comment: {
                add: [hostname, ip]
            }
        });
        callback(true);
    } else {
        callback(false);
    }
}

function detect(ip, device, options, callback) {

    function fail() {
        callback && callback(null, false, ip);
        callback = null;
    }

    if (!device._mdns 
        || !device._mdns.PTR
        || !(startsWithVELUX_KLF_LAN(device._mdns.data))
        || !(isHttpTcpLocal(device._mdns.data))
    ) return fail();

    dns.lookupService(ip, 51200, (err, hostname) => {
        if (err) {
            return fail();
        }

        addInstance(ip, hostname, device, options, callback);
    });
}

module.exports = {
    detect,
    type: ['mdns'],
    timeout: 1500
};
