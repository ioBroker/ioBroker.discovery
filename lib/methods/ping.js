'use strict';

var dns;
var ping;
var os;
var Netmask;
var ownIPs = [];

var addDevice;
var halt;

function pingOne(options, log, ip, callback) {
    // ignore own IP addresses. Later it will be 127.0.0.1 added
    if (ownIPs.indexOf(ip) !== -1) {
        return callback(null, null);
    }

    ping.probe(ip, {log: log.debug, timeout: options.pingTimeout}, function (err, res) {
        if (err) log.error(err);
        if (res && res.alive) {
            log.debug('found ' + res.host);

            dns.reverse(res.host, function (err, hostnames) {
                var obj;
                if (hostnames && hostnames.length) {
                    obj = {
                        _name: hostnames[0],
                        _ping: {
                            hostnames: hostnames
                        }
                        // i don't knof if it is used
                        // , _data: {
                        //     names: hostnames
                        // }
                    }
                } else {
                    obj = { _name: res.host };
                }
                obj._addr = res.host;
                
                // var obj = {
                //     _addr: res.host,
                //     _name: hostnames && hostnames.length ? hostnames[0] : res.host
                // };
                // if (hostnames) {
                //     // obj._data =  {
                //     //     names: hostnames
                //     // };
                //     obj._ping = {
                //         hostnames: hostnames
                //     }
                //}
                callback(null, obj);
            });
        } else {
            callback(null, null);
        }
    });
}

// function pingBlock(options, log, ips, callback) {
//     var count = 0;
//     var result = [];
//     for (var i = 0; i < ips.length; i++) {
//         count++;
//         pingOne(options, log, ips[i], function (err, res) {
//             if (err) log.error(err);
//             if (res) {
//                 log.debug('found ' + JSON.stringify(res));
//                 result.push(res);
//                 if (addDevice && addDevice(res, 'ping', 'ip') === 'halt') {
//                     //halt['ping'] = true;
//                     i = ips.length;
//                     return callback('halt', result);
//                 }
//             }
//             if (halt['ping']) {
//                 i = ips.length;
//                 return callback('halt', result);
//             }
//             if (!--count) callback(null, result);
//         });
//     }
//     if (!count) callback(null, result);
// }


function pingBlock(options, log, ips, callback) {
    var count = 0;
    
    function doReturn(err) {
        callback && callback(err);
        callback = null;
    }

    (function doIt() {
        if (count >= ips.length) {
            return doReturn (null);
        }
        
        pingOne (options, log, ips[count++], function (err, res) {
            if (err) log.error (err);
            if (res) {
                log.debug ('found ' + JSON.stringify (res));
                if (addDevice && addDevice (res, 'ping', 'ip') === 'halt') {
                    return doReturn('halt');
                }
            }
            if (halt['ping']) {
                return doReturn('halt');
            }
            //doIt();
        });
        setTimeout(doIt, 50);
    })();
}

function pingBlocks(options, log, blocks, totalLength, progressCallback, basePercent, totalRanges, callback) {
    if (!blocks || !blocks.length) {
        callback(null);
        return;
    }
    if (progressCallback) {
        progressCallback(basePercent + Math.round(((totalLength - blocks.length) * 100 / totalLength) / totalRanges));
        //progressCallback('ping', basePercent + Math.round(((totalLength - blocks.length) * 100 / totalLength) / totalRanges), _result.length);
    }

    var block = blocks.shift();
    pingBlock(options, log, block, function (err) {
        if (err === 'halt') return callback(err);
        setTimeout(pingBlocks, 0, options, log, blocks, totalLength, progressCallback, basePercent, totalRanges, callback);
    });
}

function pingRange(options, log, ip, subnet, progressCallback, basePercent, totalRanges, callback) {
    Netmask = Netmask || require('netmask').Netmask;
    var block = new Netmask(ip + '/' + subnet);

    var blocks = [];
    var b = 0;
    block.forEach(function (_ip /* , long, index */) {
        if (ip === _ip) return;
        blocks[b] = blocks[b] || [];
        if (blocks[b].length >= options.pingBlock) {
            b++;
            blocks[b] = [];
        }
        blocks[b].push(_ip);
    });

    if (blocks.length > 100) {
        log.warn('Unable to ping all addresses: To big addresses range.');
        return callback('Unable to ping all addresses: To big addresses range.');
    }

    pingBlocks(options, log, blocks, blocks.length, progressCallback, basePercent, totalRanges, callback);
}

function _pingAll(options, log, progressCallback, callback, ranges, totalRanges) {
    dns  = dns  || require('dns');
    ping = ping || require(__dirname + '/ping/ping.js');
    os   = os   || require('os');

    if (typeof ranges === 'function') {
        callback = ranges;
        ranges = null;
    }

    if (!ranges) {
        var interfaces = os.networkInterfaces();
        ranges = [];
        ownIPs = [];
        for (var k in interfaces) {
            if (!interfaces.hasOwnProperty(k) || interfaces[k].internal) continue;
            for (var k2 in interfaces[k]) {
                if (!interfaces[k].hasOwnProperty(k2)) continue;
                var address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    var parts = (address.netmask || '').split('.');
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
        return _pingAll(options, log, progressCallback, callback, ranges, ranges.length);
    }
    if (totalRanges === undefined) totalRanges = ranges.length;

    if (!ranges.length) {
        //progressCallback('ping', 100);
        callback(null); //, _result, 'ping', 'ip');
    } else {
        var range = ranges.shift();
        pingRange(options, log, range.ip, range.mask, progressCallback, 100 - Math.round(((ranges.length + 1) / totalRanges) * 100), totalRanges, function (err) {
            if (err === 'halt') return callback(err); //, result, 'ping', 'ip');
            setTimeout(_pingAll, 0, options, log, progressCallback, callback, ranges, totalRanges);
        });
    }
}

function pingAll(options, log, progressCallback, _addDevice) {
    options.pingTimeout = Math.round(options.pingTimeout / 1000) || 1;
    options.pingBlock = parseInt(options.pingBlock, 10) || 20;
    addDevice = _addDevice;
    halt = options.halt || {};
    
    if (halt['ping']) return addDevice(null, 'halt');
    var callback = function(err) {    // temporary, only for the first time.
        _addDevice (null, err);       // only _addDevice should be used
    };
    log.info('Discovering ping devices...');
    _pingAll(options, log, progressCallback, callback);
}

exports.browse = pingAll;
exports.type = 'ip';
exports.source = 'ping';
exports.foundCount = 1;  // if needed, do only read
exports.progress = 0;

exports.options = {
    pingTimeout: {
        min: 1000,
        type: 'number'
    },
    pingBlock: {
        min: 1,
        max: 50,
        type: 'number'
    }
};
