var Mdns, dns;

function discoverMdns(options, log, progressCallback, callback) {
    
	try {
		Mdns = Mdns || require ('mdns-discovery');
		dns  = dns  || require('dns');
	} catch (e) {
		log.warn('skipping mdns method, because no binary package...');
		if (typeof callback === 'function') {
            setTimeout(function (cb) {
                cb('binary package not installed', null, 'mdns', 'ip');
            }, 0, callback);
            callback = null;
        }
		return;
	}
    
    var mdns = new Mdns({
        timeout: parseInt(options.mdnsTimeout, 10) / 1000 || 10,
        name: '_http._tcp.local',
        find: '*',
        broadcast: false
    });
    
    function updateProgress(percent) {
        progressCallback('mdns', percent, mdns.found.length);
    }
    
    var percent = 0;
    var interval = setInterval(function() {
        if (percent >= 95) {
            clearInterval(interval);
            return;
        }
        updateProgress(percent);
        percent += 5;
    }, mdns.options.timeout * 1000 / 20);
    
    log.info('Discovering mDNS devices...');
    mdns.run (function (result) {
        if (result) result.forEach(function(entry) {
            entry._data = { address: entry.ip };
            entry._addr = entry.ip;
            entry._name = entry.name;
            entry._mdns = {
                name: entry.name,
                type: entry.type
            };
            
            delete entry.ip;
            delete entry.name;
            delete entry.type;
            
            //if (!entry._name) dns.reverse(entry._addr, function (err, hostnames) {
            dns.reverse(entry._addr, function (err, hostnames) {
                entry._name = hostnames && hostnames.length ? hostnames[0] : entry._name;
            });
            
        });

        updateProgress(100);
        log.info('Done discovering mDNS devices. ' + result.length + ' devices found');
        if (typeof callback === 'function') {
            callback(null, result, 'mdns', 'ip');
            callback = null;
        }
    });
}

exports.browse  = discoverMdns;
exports.type    = 'ip';
exports.subType = 'mdns';
exports.options = {
    mdnsTimeout: {
        min: 1000,
        max: 60000,
        type: 'number'
    }
};
