'use strict';

const tools = require('../tools.js');
const adapterName = 'tradfri';

const hostnameRegExp = /^gw-[a-f0-9]{12}/;
/**
 * Check if a hostname references a tradfri gateway
 * @param {string} hostname The hostname to check
 */
function hostnameIsTradfri(hostname) {
    return hostnameRegExp.test(hostname);
}

function startsWithTRADFRI(str) {
    return /^TRADFRI/.test(str);
}

/**
 * Tests if a packet references a CoAP resource
 * @param {string} packetName The name of the packet to check
 */
function isCoAP(packetName) {
    return /_coap\._udp\.local$/.test(packetName);
}

function addInstance(ip, hostname, device, options, callback) {
    // Try to find an existing instance for this IP
    const instance = tools.findInstance(options, adapterName, (obj) => {
        return obj && obj.native && (obj.native.host === ip || obj.native.host === hostname);
    });

    if (!instance) {
        const id = tools.getNextInstanceID(adapterName, options);
        options.newInstances.push({
            _id: id,
            common: {
                name: adapterName
            },
            native: {
                host: ip
            },
            comment: {
                add: [tools.translate(options.language, 'Required for %s', 'Trådfri gateway ' + hostname)]
            }
        });
        callback(true);
    } else {
        callback(false);
    }
}

function detect(ip, device, options, callback) {

    function fail() {
        callback(null, false, ip);
    }

    // console.log("tradfri => device=" + JSON.stringify(device));

    // We need to have mdns data with a PTR and SRV record, both referencing a CoAP resource
    if (!device._mdns
		|| !(device._mdns.PTR && isCoAP(device._mdns.PTR.name))
		|| !(device._mdns.SRV && isCoAP(device._mdns.SRV.name))
    ) {
        return fail();
    }

    // The PTR must point to a tradfri gateway with a corresponding SRV entry
    const fullHostname = device._mdns.PTR.data;
    const srv = device._mdns.SRV;
    if (srv.name !== fullHostname || !hostnameIsTradfri(fullHostname)) {
        return fail();
    }

    // The SRV must have a port of 5684
    if (parseInt(srv.data.port, 10) !== 5684) {
        return fail();
    } // != because we don't know if string or number

    // And the A(AAA) record must contain "TRADFRI"
    const ARecord = device._mdns.A || device._mdns.AAAA;
    if (!startsWithTRADFRI(ARecord.name)) {
        return fail();
    }

    const shortHostname = hostnameRegExp.exec(fullHostname)[0];
    addInstance(ip, shortHostname, device, options, callback);
}

module.exports = {
    detect,
    type: ['mdns'],
    timeout: 1500
};
