/* global pingBlocks, pingRanges */

'use strict';

let dns;
let ping;
let os;
let Netmask;
let ownIPs = [];

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function pingAll(self) {
    self.addDevice({
        _addr: '127.0.0.1',
        _name: 'localhost',
        _ping: {
            alive: true,
            ms: 2000
        }
    });

    dns  = dns  || require('dns');
    ping = ping || require('./ping/ping.js');
    os   = os   || require('os');
    Netmask = Netmask || require('netmask').Netmask;

    self.options.pingTimeout = Math.round(self.options.pingTimeout / 1000) || 1;
    self.options.pingBlock = parseInt(self.options.pingBlock, 10) || 20;

    let ranges;
    let blockCount;
    let ipCount;
    let rangeCount = 0;

    function getRanges() {
        const interfaces = os.networkInterfaces();
        ranges = [];
        ownIPs = [];
        self.adapter.log.debug('Network interfaces found: ' + JSON.stringify(interfaces));
        if (typeof self.options.pingOwnIP === 'string' && /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(self.options.pingOwnIP)) {
            // add the configured network segment
            self.adapter.log.info('Add pingOwnIP network entry: ' + self.options.pingOwnIP + ' / ' + self.options.pingOwnNetmask);
            interfaces["ioBroker.discovery"] = [{
                family: 'IPv4',
                netmask: self.options.pingOwnNetmask ? self.options.pingOwnNetmask.toString() : self.options.pingOwnNetmask,
                address: self.options.pingOwnIP,
                internal: false
            }];
        } else if (self.options.pingOwnIP) {
            self.adapter.log.info('Ignore pingOwnIP setting because invalid: ' + self.options.pingOwnIP);
        }
        for (const k in interfaces) {
            if (!interfaces.hasOwnProperty(k) || interfaces[k].internal) {
                continue;
            }
            for (const k2 in interfaces[k]) {
                if (!interfaces[k].hasOwnProperty(k2)) {
                    continue;
                }

                const address = interfaces[k][k2];

                if (address.family === 'IPv4' && !address.internal) {
                    const parts = (address.netmask || '').split('.');
                    // If range is too big => reduce it to 255.255.255.0

                    // TODO: try to ping x.x.x.1 and if someone is there, take this range too
                    // TODO: add ranges, where UPnP found devices

                    if (parts.length === 4 && (parseInt(parts[0], 10) !== 255 || parseInt(parts[1], 10) !== 255 || parseInt(parts[2], 10) < 0xFC /* 255.255.252.0 */)) {
                        parts[0] = '255';
                        parts[1] = '255';
                        parts[2] = '255';
                        address.netmask = parts.join('.');
                    }
                    ownIPs.push(address.address);
                    ranges.push({ip: address.address, mask: address.netmask});
                }
            }
        }
        self.adapter.log.debug('ownIPs: ' + JSON.stringify(ownIPs))
        self.adapter.log.debug('ranges: ' + JSON.stringify(ranges))
    }

    function pingBlock(ips, _callback) {
        function callback (err) {
            _callback && _callback(err);
            _callback = null;
        }
        ipCount = 0;

        (function pingIp(error) {
            if (error || ipCount >= ips.length) {
                return callback(error);
            }
            const ip = ips[ipCount++];
            // is this necessary? own IPs are filter out in pingRanges
            if (ownIPs.indexOf(ip) !== -1) {
                return pingIp(error);
            }
            // IP already known;
            if (self.get(ip, 'ip') !== undefined) {
                return pingIp(error);
            }

            ping.probe(ip, {log: self.adapter.log.debug, timeout: self.options.pingTimeout}, (err, res) => {
                if (self.halt === true || self.halt['ping']) {
                    return pingIp('halt');
                }

                err && self.adapter.log.error(err);

                if (!res || !res.alive) {
                    return;
                }
                self.adapter.log.debug('found ' + res.host);

                const obj = {
                    _addr: res.host,
                    _ping: {
                        alive: res.alive,
                        ms: res.ms
                    }
                };

                self.addDevice(obj);

                // dns.reverse(res.host, function (err, hostnames) {  will be done in main. Only for unknown names. Maybe ohter methods find a name before
                //     const obj;
                //     if (hostnames && hostnames.length) {
                //         obj = {
                //             _name: hostnames[0],
                //             _ping: {
                //                 hostnames: hostnames
                //             }
                //             // i don't knof if it is used
                //             // , _data: {
                //             //     names: hostnames
                //             // }
                //         }
                //     } else {
                //         obj = { _name: res.host };
                //     }
                //     obj._addr = res.host;
                //
                //     self.addDevice (obj);
                // });
            });
            setTimeout(pingIp, 50, error);
        })();
    }

    function pingRange (range, callback) {
        const blocks = [[]];
        let b = 0;
        const block = new Netmask(range.ip + '/' + range.mask); //subnet);
        block.forEach(ip => {
            // skip own ip
            if (ip === range.ip) {
                return;
            }
            if (blocks[b].length >= self.pingBlock) {
                blocks[++b] = [];
            }
            blocks[b].push(ip);
        });

        if (blocks.length > 100) {
            const err = 'Unable to ping all addresses: To big addresses range.';
            self.adapter.log.warn(err);
            return callback (err);
        }

        blockCount = 0;
        (function pingBlocks(err) {
            if (err || blockCount >= blocks.length) {
                return callback(err);
            }
            self.updateProgress ((rangeCount*blockCount) * 100 / (ranges.length * blocks.length));
            pingBlock (blocks[blockCount++], pingBlocks);
        })();
    }

    self.adapter.log.info('Discovering ping devices...');
    getRanges();

    (function pingRanges(err) {
        if (err || rangeCount >= ranges.length) {
            return self.done(err);
        }
        pingRange (ranges[rangeCount++], pingRanges);
    })();
}


exports.browse = pingAll;
exports.type = 'ip';
exports.source = 'ping';

exports.options = {
    pingTimeout: {     // not needed, or?
        min: 1000,
        type: 'number'
    },
    pingBlock: {
        min: 1,
        max: 50,
        type: 'number'
    }
};
