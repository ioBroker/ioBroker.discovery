'use strict';

var dns = require('dns');
var UPnPClient;


function discoverUpnp(self) { //options, log, progressCallback, addDevice) {
    //self.options.upnpTimeout = parseInt(self.options.upnpTimeout, 10) || 15000; //15 seconds because of HUE
    self.timeout = ~~self.timeout || 15000; //15 seconds because of HUE
    
    UPnPClient = UPnPClient || require('node-ssdp').Client;
    var client = new UPnPClient();
    //var dns    = require('dns');
    var result = [];
    var ips = {};
    
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
            var o = ips [rinfo.address];
            if (!o._upnp) o._upnp = headers;
            return;
        }
        self.adapter.log.debug('UPNP Answer from ' + rinfo.address);
        var obj = {
            //_data: rinfo,
            _addr: rinfo.address,
            _name: '',
            _upnp: headers
        };
    
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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// can be removed in the feature
function old_discoverUpnp(options, log, progressCallback, addDevice) {
    options.upnpTimeout = parseInt(options.upnpTimeout, 10) || 15000; //15 seconds because of HUE

    UPnPClient = UPnPClient || require('node-ssdp').Client;
    var client = new UPnPClient();
    //var dns    = require('dns');
    var result = [];
    var ips = {};
    
    function doReturn (clear) {
        if (clear !== false && timer) clearTimeout(timer);
        timer = null;
        if (client) {
            client.stop ();
            client = null;
        }
        if (progressTimeout) {
            clearTimeout (progressTimeout);
            progressTimeout = null;
        }
        addDevice && addDevice(null);
        addDevice = null;
    }
    var timer = setTimeout(doReturn, options.upnpTimeout, false);
    
    var progressTimeout;

    function updateProgress() {   // should be done in main.js for all methods
        progressTimeout = null;
        progressCallback();
        exports.progress += 10;
        if (exports.progress < 100) {
            progressTimeout = setTimeout(updateProgress, Math.round(options.upnpTimeout / 10));
        }
    }

    client.on('response', function (headers, statusCode, rinfo) {
        if (!rinfo || !rinfo.address) return;
        if (ips [rinfo.address]) {
            var o = ips [rinfo.address];
            if (!o._upnp) o._upnp = headers;
            return;
        }
        log.debug('UPNP Answer from ' + rinfo.address);
        var obj = {
            //_data: rinfo,
            _addr: rinfo.address,
            _name: '',
            _upnp: headers
        };
    
        if (addDevice) {
            var ret = addDevice(obj);
            if (ret === 'halt') {
                if (timer) clearTimeout(timer);
                return doReturn();
            }
            ips[rinfo.address] = ret;
        }

        // should be done at the end of all discoveries
        // dns.reverse(rinfo.address, function (err, hostnames) {
        //     obj._name = hostnames && hostnames.length ? hostnames[0] : rinfo.address;
        // });
    });

    client.on('error', function (err) {
        doReturn();
    });

    log.info('Discovering UPnP devices...');
    client.search('ssdp:all');
    updateProgress();
}
exports.foundCount = 0;  // if needed, do only read
exports.progress = 0;
// end
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.browse = discoverUpnp;
exports.old_browse = old_discoverUpnp;
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