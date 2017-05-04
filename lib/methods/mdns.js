var Mdns, dns;

var methodName = 'mdns';

function discoverMdns(options, log, updateProgress, addDevice) {
    
	try {
		Mdns = Mdns || require ('mdns-discovery');
		dns  = dns  || require('dns');
	} catch (e) {
		log.warn('skipping mdns method, because no binary package...');
		if (typeof addDevice === 'function') {
            setTimeout(function (cb) {
                cb (null, 'binary package not installed');
            }, 1, addDevice);
            addDevice = null;
        }
		return;
	}
	
    var mdns = new Mdns ({
        timeout: parseInt (options.mdnsTimeout, 10) / 1000 || 10,
        name: [ '_amzn-wplay._tcp.local', '_http._tcp.local' ],
        find: '*',
        broadcast: false
    });
    
    var interval = setInterval(function() {    // should be done in main.js for all methods
        if (exports.progress >= 95) {
            clearInterval(interval);
            return;
        }
        exports.progress += 5;
        updateProgress ();
    }, mdns.options.timeout * 1000 / 20);
    
    log.info('Discovering mDNS devices...');
    mdns.on('entry', function(entry) {
        var device = {
            //_data: {address: entry.ip}, // is it used?
            _addr: entry.ip,
            _name: entry.name,
            _mdns: {}
        };
        Object.keys(entry).forEach(function(n) {
            device._mdns[n] = entry[n];
        });
        if (addDevice && addDevice(device) === 'halt') {
            mdns.close();
            addDevice && addDevice(null);
            addDevice = null;
        }
    });
    mdns.run (function (result) {
        addDevice && addDevice(null);
        addDevice = null;
    });
}

exports.browse  = discoverMdns;
exports.type    = 'ip';
//exports.subType = 'mdns';
exports.source = methodName;
exports.foundCount = 0;  // if needed, do only read
exports.progress = 0;


exports.options = {
    mdnsTimeout: {
        min: 15000,
        max: 60000,
        type: 'number'
    }
};
