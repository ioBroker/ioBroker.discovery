'use strict';

//const dns = require('dns');
let UPnPClient;

function discoverUpnp(self) {
    self.timeout = ~~self.timeout || 15000; //15 seconds because of HUE

    try {
        UPnPClient = UPnPClient || require('node-ssdp').Client;
    } catch (e) {
        console.error('Cannot init discoverUpnp: ' + e);
        self.done.bind(self);
        return;
    }

    const client = new UPnPClient();
    const ips = {};

    self.close = function() {
        if (client) {
            client.stop ();
            client = null;
        }
    };
    self.setTimeout(self.timeout);

    client.on('response', function (headers, statusCode, rinfo) {
        if (!rinfo || !rinfo.address) return;
        if (ips [rinfo.address]) {
            const o = ips [rinfo.address];
            if (!o._upnp) o._upnp = headers;
            return;
        }
        const obj = {
            //_data: rinfo,
            _addr: rinfo.address,
            _name: '',
            _upnp: headers
        };
    
        self.adapter.log.debug('UPNP Answer from ' + rinfo.address + ' : ' + JSON.stringify(obj));

        if (self.halt === true || self.halt[self.source] === true) return self.done();
        ips[rinfo.address] = self.addDevice(obj);

        // should be done at the end of all discoveries
        // dns.reverse(rinfo.address, function (err, hostnames) {
        //     obj._name = hostnames && hostnames.length ? hostnames[0] : rinfo.address;
        // });
    });

    client.on('error', self.done.bind(self));
    self.adapter.log.info('Discovering UPnP devices...');
    client.search('ssdp:all');
}

exports.browse = discoverUpnp;
exports.type = 'ip';
exports.source = 'upnp';
exports.timeout = 15000;

exports.options = {
    upnpTimeout: {
        min: 1000,
        max: 60000,
        type: 'number'
    }
};
