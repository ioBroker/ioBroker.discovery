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
    
    var mdns = new Mdns ({
        timeout: parseInt (options.mdnsTimeout, 10) / 1000 || 10,
        //name: '_http._tcp.local',
        name: [ '_amzn-wplay._tcp.local', '_http._tcp.local' ],
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
        if (result) result.forEach(function(entry, i) {
            var newEntry = {
                _data: {address: entry.ip},
                _addr: entry.ip,
                _name: entry.name,
                _mdns: {}
            };
            Object.keys(entry).forEach(function(n) {
                newEntry._mdns[n] = entry[n];
            });
            result[i] = newEntry;
            //console.log('discivery.mdns.discoverMdns: ip='+newEntry._addr + JSON.stringify(newEntry));
            dns.reverse(newEntry._addr, function (err, hostnames) {
                newEntry._name = hostnames && hostnames.length ? hostnames[0] : newEntry._name;
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
        min: 15000,
        max: 60000,
        type: 'number'
    }
};
