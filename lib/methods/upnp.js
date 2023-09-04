'use strict';

const tools = require('../tools.js');

//const dns = require('dns');
let UPnPClient;

function discoverUpnp(self) {
    self.timeout = ~~self.timeout || 15000; // 15 seconds because of HUE

    try {
        UPnPClient = UPnPClient || require('node-ssdp').Client;
    } catch (e) {
        console.error(`Cannot init discoverUpnp: ${e.message}`);
        self.done.bind(self);
        return;
    }

    let client = new UPnPClient();
    // needed to receive multicast packages on udp 1900
    let multicast_client = new UPnPClient({sourcePort: 1900});

    self.close = () => {
        if (client) {
            client.stop();
            client = null;
        }
        if (multicast_client) {
            multicast_client.stop();
            multicast_client = null;
        }
    };
    self.setTimeout(self.timeout);

    multicast_client.on('advertise-alive', (headers, rinfo) => self.parseMessage(headers, 0, rinfo));
    client.on('response', (headers, statusCode, rinfo) => self.parseMessage(headers, statusCode, rinfo));
    multicast_client.on('response', (headers, statusCode, rinfo) => self.parseMessage(headers, statusCode, rinfo));

    self.parseMessage = async function (headers, statusCode, rinfo) {
        if (!rinfo || !rinfo.address) {
            return;
        }

        if (headers.LOCATION) {
            await new Promise(resolve => setTimeout(resolve,3000));
            try {
                headers._location = await tools.httpGet(headers.LOCATION);
            } catch (error) {
                // ignore
            }
        }
        const obj = {
            // _data: rinfo,
            _addr: rinfo.address,
            _name: '',
            _upnp: headers,
        };

        self.adapter.log.debug(`UPNP Answer from ${rinfo.address}: ${JSON.stringify(obj)}`);

        if (self.halt === true || self.halt[self.source] === true) {
            return self.done();
        }

        self.addDevice(obj);
    };

    client.on('error', self.done.bind(self));
    multicast_client.on('error', self.done.bind(self));
    self.adapter.log.info('Discovering UPnP devices...');
    self.adapter.log.debug('Discover Test 2');
    try {
        multicast_client.start();
        client.search('ssdp:all');
    } catch (e) {
        console.error(`Cannot start discoverUpnp: ${e.message}`);
        self.done.bind(self);
    }
}

exports.browse  = discoverUpnp;
exports.type    = 'upnp';
exports.source  = 'upnp';
exports.timeout = 15000;

exports.options = {
    upnpTimeout: {
        min: 1000,
        max: 60000,
        type: 'number',
    }
};
