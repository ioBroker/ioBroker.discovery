'use strict';

const tools = require('../tools.js');
const dns = require('dns');
const adapterName = 'klf200';

function startsWithVELUX_KLF_LAN(str) {
    return /^VELUX_KLF_LAN_/.test(str);
}

function isHttpTcpLocal(str) {
    return /^_http\._tcp\.local$/.test(str);
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
        options.log.debug(`Instance for KLF-200 device for host ${hostname} at ${ip} already exists.`);
        callback(false);
    }
}

function detect(ip, device, options, callback) {

    function fail() {
        callback && callback(null, false, ip);
        callback = null;
    }

    options.log.debug(`Trying to detect KLF-200 using the following device information: ${JSON.stringify(device)} at IP ${ip}.`);

    if (!device._mdns 
        || !device._mdns.PTR
        || !(isHttpTcpLocal(device._mdns.PTR.data))
        || !device._mdns.PTR.datax
        || !Array.isArray(device._mdns.PTR.datax)
        // Check if the array datax contains a VELUX_KLF_LAN entry by first mapping every entry to true/false by checking the text
        // and then reduce the true/false values to a single true/false value (true, if at least on entry matched the pattern).
        || !(device._mdns.PTR.datax.map(x => startsWithVELUX_KLF_LAN(x)).reduce((prev, curr) => prev || curr, false))
    ) {
        options.log.debug(`IP ${ip} not recognized as KLF-200 device.`);
        return fail();
    }

    dns.lookupService(ip, 51200, (err, hostname) => {
        if (err) {
            options.log.debug(`Error ${err} during lookup of hostname for IP ${ip}.`);
            return fail();
        }

        options.log.debug(`KLF-200 device detected at ${hostname} (${ip}).`);
        addInstance(ip, hostname, device, options, callback);
    });
}

module.exports = {
    detect,
    type: ['mdns'],
    timeout: 1500
};
