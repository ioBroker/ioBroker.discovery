"use strict";

var tools = require(__dirname + '/../tools.js');

var adapterName = 'wifilight';

function addInstance(ip, device, options, meta, callback) {
    
    var newInstanceCount = options.newInstances.length,
        instance = tools.findInstance(options, adapterName),
        add = [meta.name, ip, meta.mac];
    
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName
            },
            native: {
                //useSSDP: true,
                devices: []
            },
            comment: {
                add: [] //add
            }
        };
        options.newInstances.push(instance);
    }
    var nDevices, dev = (instance && instance.native && (nDevices = instance.native.devices) && nDevices.find(function (dev, i) {
        return dev.ip === ip;
    }));
    if (!dev) {
        dev = {
            ip: ip,
            name: meta.name,
            mac: meta.mac
        };
        nDevices.push (dev);
    
        if (instance._existing) {
            options.newInstances.push (instance);
            instance.comment = instance.comment || {};
        }
        if (instance.comment.ack) instance.comment.ack = false;
        if (instance.comment.add) {
            instance.comment.add.push (add.join (', '));
        } else {
            instance.comment.extended = instance.comment.extended || [];
            instance.comment.extended.push (add.join (', '));
        }
    }
    callback(null, newInstanceCount !== options.newInstances.length, ip);
}


function detect(ip, device, options, callback) {
    //console.log('discovery.wifilight: source=' + device._source + ' ip=' + ip) ;

    if (device._source !== 'wifi-mi-light') return callback(null, false, ip);
    addInstance (ip, device, options, device._wifi_mi_light, callback);
}



exports.detect = detect;
exports.type = ['ip'];
//exports.timeout = 2000;
//exports.reloadModule = true;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// without a method-module...
//

if (0) {
    
    "use strict";
    
    var tools = require (__dirname + '/../tools.js');
    
    var dgram = require ('dgram'),
        os = require ('os'),
        Netmask = require ('netmask').Netmask;
    
    var BROADCAST_PORT = 48899;
    
    var scanForDevices = function (checkCb, cb) {
        
        var BC_ID = "HF-A11ASSISTHREAD"; //V6 API
        var msg = new Buffer (BC_ID);
        var boradcasts = [];
        var ifaces = os.networkInterfaces ();
        
        for (var name in ifaces) {
            ifaces[name].forEach (function (iface) {
                if ('IPv4' !== iface.family || iface.internal) {
                    return;
                }
                var netmask = new Netmask (iface.address, iface.netmask);
                boradcasts.push (netmask.broadcast);
            })
        }
        var result = [];
        var client = dgram.createSocket ("udp4");
        client.bind (BROADCAST_PORT);
        client.on ('listening', function () {
            client.setBroadcast (true);
        });
        client.on ('message', function (message, rinfo) {
            var s = message.toString ();
            if (rinfo.port !== BROADCAST_PORT || s === BC_ID || s.indexOf ('+ERR') === 0) {
                return;
            }
            if (result.indexOf (s) > -1) return;
            result.push (s);
        });
        
        var interval = setInterval (function () {
            boradcasts.forEach (function (ip) {
                client.send (msg, 0, msg.length, BROADCAST_PORT, ip);
            });
        }, 300);
        
        setTimeout (function () {
            clearInterval (interval);
            client.close ();
            
            for (var i = 0; i < result.length; i++) {
                var ar = result[i].split (',');
                result[i] = {
                    name: ar[2],
                    mac: ar[1],
                    ip: ar[0]
                    //type: '',
                    //port: 5577,
                    //pollIntervall: 30
                };
                if (checkCb && !checkCb (result[i])) {
                    result.splice (i--, 1);
                    continue;
                }
            }
            if (cb) cb (result);
        }, 2500);
    };
    
    
    var scanForMiLightDevices = function scanForMiLightDevices (checkCb, cb) {
        var port = 48899;
        var ip = '255.255.255.255';
        var result = [];
        
        var socket = dgram.createSocket ({type: 'udp4', reuseAddr: true});
        //var socket = dgram.createSocket('udp4');
        socket.on ('error', function (err) {
        });
        socket.on ("listening", function (error) {
            if (error) return cb && cb (error);
            socket.setBroadcast (true);
        });
        socket.on ('message', function (msg, rinfo) {
            msg = msg.toString ();
            if (result.indexOf (msg) > -1) return;
            result.push (msg);
        });
        
        var search = function search () {
            var pkt = new Buffer ('Link_Wi-Fi');
            socket.send (pkt, 0, pkt.length, port, ip, function (err, data) {
            });
        };
        search ();
        
        setTimeout (function () {
            socket.close ();
            for (var i = 0; i < result.length; i++) {
                var ar = result[i].split (',');
                result[i] = {
                    name: 'Mi-Light',
                    mac: ar[1],
                    ip: ar[0]
                    //type: 'MiLight'
                };
                if (checkCb && !checkCb (result[i])) {
                    result.splice (i--, 1);
                    continue;
                }
            }
            if (cb) cb (result);
        }, 2000);
        
    };
    
    var scanForAllDevices = function scanForAllDevices (checkCb, cb) {
        scanForDevices (checkCb, function (result) {
            scanForMiLightDevices (checkCb, function (result2) {
                if (cb) cb (result.concat (result2));
            });
        });
    };
    
    var adapterName = 'wifilight';
    
    var addInstance = function (ip, device, options, meta, callback) {
        
        var newInstanceCount = options.newInstances.length,
            instance = tools.findInstance (options, adapterName);
        if (!instance) {
            instance = {
                _id: tools.getNextInstanceID (adapterName, options),
                common: {
                    name: adapterName
                },
                native: {
                    //useSSDP: true,
                    devices: []
                },
                comment: {
                    add: [meta.name, meta.mac, ip]
                }
            };
            options.newInstances.push (instance);
        }
        var nDevices,
            dev = (instance && instance.native && (nDevices = instance.native.devices) && nDevices.find (function (dev, i) {
                return dev.ip === ip;
            }));
        if (!dev) {
            dev = {
                ip: ip,
                name: meta.name,
                mac: meta.mac
            };
            nDevices.push (dev);
        }
        
        if (instance._existing) {
            options.newInstances.push (instance);
            instance.comment = instance.comment || {};
        }
        if (!instance.comment.add) {
            instance.comment.extended = instance.comment.extended || [];
            instance.comment.extended.push (meta.ip + ' - ' + meta.name);
        } else {
            instance.comment.add.push (meta.ip + ' - ' + meta.name);
        }
        
        
        callback (newInstanceCount !== options.newInstances.length);
    };


// function scanWifilight(callback) {
//     multicastScan({
//         ip: '255.255.255.255',
//         port: 48899,
//         text: "HF-A11ASSISTHREAD",
//         broadcast: true,
//         multicastTTL: 128
//
//     }, callback)
// }
    
    var result;
    
    var detect = function (ip, device, options, callback) {
        
        console.log ('discovery.wifilight: source=' + device._source + ' ip=' + ip);
        if (device._source === undefined && ip === '127.0.0.1') {
            // * last call, resest global vars
            result = undefined;
            return cb (false);
        }
        
        function cb (err, is) {
            if (is === undefined) {
                is = err;
                err = null;
            }
            callback && callback (err, is, ip);
            callback = null;
        }
        
        function doReturn () {
            if (result) for (var i = result.length - 1; i >= 0; i--) {
                if (result[i].ip === ip) {
                    var meta = result.splice (i, 1)[0];
                    addInstance (ip, device, options, meta, cb);
                    return;
                }
            }
            cb (false);
        }
        
        //if (device._source === 'upnp' || device._source === 'ip') {
        if (device._source !== 'ping') return cb (null, false);
        if (result) return doReturn ();
        
        scanForAllDevices (
            function () {
                return true; // * true = valid
            },
            function (_result) {
                result = _result || [];
                doReturn ();
            }
        );
    };
    
    exports.detect = detect;
    exports.type = ['ip'];
    exports.timeout = 10000;
    exports.reloadModule = true;
    
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////






