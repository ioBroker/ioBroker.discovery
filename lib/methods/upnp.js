'use strict';

var UPnPClient;

function discoverUpnp(options, log, progressCallback, callback) {
    options.upnpTimeout = parseInt(options.upnpTimeout, 10) || 10000;

    UPnPClient = UPnPClient || require('node-ssdp').Client;
    var client = new UPnPClient();

    var result = [];

    var timer = setTimeout(function () {
        timer = null;
        client.stop();
        client = null;
        if (typeof callback === 'function') callback(null, result, 'upnp');
    }, options.upnpTimeout);

    client.on('response', function (headers, statusCode, rinfo) {
       result.push({_data: rinfo}); //{_addr: , _name: ,...}
        if (isStopping) {
            timer = null;
            client.stop();
            client = null;
            if (typeof callback === 'function') callback(null, result, 'upnp');
        }
    });
    client.on('error', function (err) {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (typeof callback === 'function') callback(err, result, 'upnp');
    });

    // get a list of all services on the network
    log.info('Discover UPnP devices...');
    client.search('ssdp:all');
}

exports.browse = discoverUpnp;
exports.type = 'ip';
exports.options = {
    upnpTimeout: {
        min: 1000,
        max: 60000,
        type: 'number'
    }
};