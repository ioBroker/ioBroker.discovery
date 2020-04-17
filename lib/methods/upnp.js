'use strict';

const tools = require('../tools.js');

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

    let client = new UPnPClient();
    // const ips = {};

    self.close = () => {
        if (client) {
            client.stop ();
            client = null;
        }
    };
    self.setTimeout(self.timeout);

    client.on('response', (headers, statusCode, rinfo) => {
        if (!rinfo || !rinfo.address) return;
        /*if (ips [rinfo.address]) {
            const o = ips [rinfo.address];
            if (!o._upnp) o._upnp = headers;
            return;
        }*/


        if (headers.LOCATION) {
            tools.httpGet(headers.LOCATION, (err, data) => {
                if (!err) {
                    headers._location = data;
                }
            });

            const obj = {
                //_data: rinfo,
                _addr: rinfo.address,
                _name: '',
                _upnp: headers
            };
    
            self.adapter.log.debug('UPNP Answer from ' + rinfo.address + ' : ' + JSON.stringify(obj));

            if (self.halt === true || self.halt[self.source] === true) {
                return self.done();
            }

            self.addDevice(obj);
        } else {
            const obj = {
                //_data: rinfo,
                _addr: rinfo.address,
                _name: '',
                _upnp: headers
            };
            
            self.adapter.log.debug('UPNP Answer from ' + rinfo.address + ' : ' + JSON.stringify(obj));

            if (self.halt === true || self.halt[self.source] === true) {
                return self.done();
            }

            self.addDevice(obj);
        }
    });

    client.on('error', self.done.bind(self));
    self.adapter.log.info('Discovering UPnP devices...');
    self.adapter.log.debug('Discover Test 2');
    client.search('ssdp:all');
}

exports.browse  = discoverUpnp;
exports.type    = 'upnp';
exports.source  = 'upnp';
exports.timeout = 15000;

exports.options = {
    upnpTimeout: {
        min: 1000,
        max: 60000,
        type: 'number'
    }
};
