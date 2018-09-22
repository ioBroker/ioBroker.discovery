'use strict';

let Mdns;
let dns;

const methodName = 'mdns';

function browse(self) {

    try {
        Mdns = Mdns || require('mdns-discovery');
        dns = dns || require('dns');
    } catch (e) {
        if (typeof self !== 'object')
            self.log.warn('skipping mdns method, because no binary package...');
        setTimeout(self.done.bind(self, 'binary package not installed'));
        return;
    }

    this.close = () => {
        mdns.close();
        self.done();
    };

    const mdns = new Mdns({
        timeout: parseInt(self.timeout, 10) / 1000 || 10,
        name: [
            '_services._dns-sd._udp.local',
            '_raop._tcp.local',
            '_sleep-proxy.-udp',
            '_homekit._tcp',
            '_amzn-wplay._tcp.local',
            '_http._tcp.local',
            '_mieleathome._tcp',
            '_services._dns-sd._udp.local',
            '_touch-able._udp',
            '_coap._udp.local' // used to discover tradfri devices
        ],
        find: '*',
        broadcast: false
    });
    mdns.noQuestions = true;
    self.setTimeout(self.timeout, {timeout: false});

    this.log.info('Discovering mDNS devices...');
    mdns.on('entry', entry => {
        const device = {
            //_data: {address: entry.ip}, // is it used?
            _addr: entry.ip,
            _name: entry.name,
            _mdns: {}
        };
        Object.keys(entry).forEach(n => device._mdns[n] = entry[n]);
        
        //self.log.debug('Discovered mDNS device: ' + JSON.stringify(device));
        if (self.addDevice(device) === 'halt') {
            self.done();
        }
    });
    mdns.run(result => self.done());
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// can be removed in the feature
function oldBrowse(options, log, updateProgress, addDevice) {
    try {
        Mdns = Mdns || require('mdns-discovery');
        dns = dns || require('dns');
    } catch (e) {
        log.warn('skipping mdns method, because no binary package...');
        if (typeof addDevice === 'function') {
            setTimeout(cb => cb(null, 'binary package not installed'), 1, addDevice);
            addDevice = null;
        }
        return;
    }

    const mdns = new Mdns({
        timeout: parseInt(options.mdnsTimeout, 10) / 1000 || 10,
        name: ['_services._dns-sd._udp.local', '_raop._tcp.local', '_sleep-proxy.-udp', '_homekit._tcp', '_amzn-wplay._tcp.local', '_http._tcp.local', '_mieleathome._tcp', '_services._dns-sd._udp.local', '_touch-able._udp'],
        find: '*',
        broadcast: false
    });
    mdns.noQuestions = true;

    const interval = setInterval(() => {    // should be done in main.js for all methods
        if (exports.progress >= 95) {
            clearInterval(interval);
            return;
        }
        exports.progress += 5;
        updateProgress();
    }, mdns.options.timeout * 1000 / 20);

    log.info('Discovering mDNS devices...');
    mdns.on('entry', entry => {
        const device = {
            //_data: {address: entry.ip}, // is it used?
            _addr: entry.ip,
            _name: entry.name,
            _mdns: {}
        };

        Object.keys(entry).forEach(n => device._mdns[n] = entry[n]);

        if (addDevice && addDevice(device) === 'halt') {
            mdns.close();
            addDevice && addDevice(null);
            addDevice = null;
        }
    });
    mdns.run(result => {
        addDevice && addDevice(null);
        addDevice = null;
    });
}

exports.foundCount = 0;  // if needed, do only read
exports.progress = 0;
// end
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.browse = browse;
exports.oldBrowse = oldBrowse;
exports.type = 'ip';
//exports.subType = 'mdns';
exports.source = methodName;
exports.timeout = 15000;

exports.options = {};

// exports.options = {
//     mdnsTimeout: {
//         min: 15000,
//         max: 60000,
//         type: 'number'
//     }
// };
