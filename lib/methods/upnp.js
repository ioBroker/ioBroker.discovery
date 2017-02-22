'use strict';

var UPnPClient;

function discoverUpnp(options, log, progressCallback, callback) {
    options.upnpTimeout = parseInt(options.upnpTimeout, 10) || 10000;

    UPnPClient = UPnPClient || require('node-ssdp').Client;
    var client = new UPnPClient();
    var dns    = require('dns');
    var result = [];

    var timer = setTimeout(function () {
        timer = null;
        client.stop();
        client = null;
        if (progressTimeout) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
        }
        updateProgress(100);

        if (typeof callback === 'function') {
            callback(null, result, 'upnp');
        }

    }, options.upnpTimeout);

    var progressTimeout;

    function updateProgress(progress) {
        progressTimeout = null;
        progress = progress || 0;
        progressCallback('upnp', progress);
        if (progress < 100) {
            progressTimeout = setTimeout(updateProgress, Math.round(options.upnpTimeout / 10), progress + 10);
        }
    }

    client.on('response', function (headers, statusCode, rinfo) {
        for (var a = 0; a < result.length; a++) {
            if (result[a]._addr === rinfo.address) {
                return;
            }
        }
        var obj = {
            _data: rinfo,
            _addr: rinfo.address,
            _name: rinfo.address
        }; //{_addr: , _name: ,...}

        result.push(obj);

        dns.reverse(rinfo.address, function (err, hostnames) {
            obj._name = hostnames && hostnames.length ? hostnames[0] : rinfo.address;
        });
    });

    client.on('error', function (err) {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (progressTimeout) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
        }
        updateProgress(100);
        if (typeof callback === 'function') callback(err, result, 'upnp');
    });

    // get a list of all services on the network
    log.info('Discover UPnP devices...');
    client.search('ssdp:all');
    updateProgress();
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