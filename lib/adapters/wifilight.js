'use strict';

const tools = require('../tools.js');

const adapterName = 'wifilight';

function addInstance(ip, device, options, meta, callback) {

    const newInstanceCount = options.newInstances.length;
    let instance = tools.findInstance(options, adapterName);
    const add = [meta.name || meta.type, ip, meta.mac];

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
    let nDevices;
    let dev = (instance && instance.native && (nDevices = instance.native.devices) && nDevices.find(dev => dev.ip === ip));
    if (!dev) {
        dev = {
            ip: ip,
            name: meta.name || meta.type,
            mac: meta.mac
        };
        nDevices.push(dev);

        if (instance._existing) {
            options.newInstances.push(instance);
            instance.comment = instance.comment || {};
        }
        if (instance.comment.ack) instance.comment.ack = false;
        if (instance.comment.add) {
            instance.comment.add.push(add.join(', '));
        } else {
            instance.comment.extended = instance.comment.extended || [];
            instance.comment.extended.push(add.join(', '));
        }
    }
    callback(null, newInstanceCount !== options.newInstances.length, ip);
}


function detect(ip, device, options, callback) {
    //console.log('discovery.wifilight: source=' + device._source + ' ip=' + ip + ' __wifi_mi_light=' + !!device._wifi_mi_light) ;

    // We want to support both legacy v5 Bridges (detected by Wifi-Mi-Light)
    // And v6 bridges (detected by HF-LPB100)
    const metaObj = device._wifi_mi_light || device._hf_lpb100;
    // If this is a v6 bridge, no network settings must be set
    // as the MiLight devices don't have any
    if (metaObj != null && metaObj.networkSettings == null) {
        addInstance(ip, device, options, metaObj, callback);
    } else {
        return callback(null, false, ip);
    }
}


exports.detect = detect;
exports.type = ['ip'];

//exports.timeout = 2000;
//exports.reloadModule = true;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// without the wifi-mi-light method-module...
//

// if (0) {
//
//     "use strict";
//
//     const tools = require (__dirname + '/../tools.js');
//
//     const dgram = require ('dgram'),
//         os = require ('os'),
//         Netmask = require ('netmask').Netmask;
//
//     const BROADCAST_PORT = 48899;
//     const g_resultCount = 0;
//
//     const DURATION1 = 7000;
//     const DURATION2 = 2000;
//
//     exports.scanForDevices = function (checkCb, cb) {
//
//         const BC_ID = "HF-A11ASSISTHREAD"; //V6 API
//         const msg = new Buffer(BC_ID);
//         const boradcasts = [];
//         const ifaces = os.networkInterfaces();
//
//         for (const name in ifaces) {
//             ifaces[name].forEach(function (iface) {
//                 if ('IPv4' !== iface.family || iface.internal) {
//                     return;
//                 }
//                 const netmask = new Netmask(iface.address, iface.netmask);
//                 boradcasts.push(netmask.broadcast);
//             })
//         }
//         const result = [];
//         const client = dgram.createSocket("udp4");
//         client.bind(BROADCAST_PORT);
//         client.on('listening', function () {
//             client.setBroadcast(true);
//         });
//         client.on('message', function (message, rinfo) {
//             const s = message.toString();
//             if (rinfo.port !== BROADCAST_PORT || s === BC_ID || s.indexOf('+ERR') === 0) {
//                 return;
//             }
//             if (result.indexOf(s) > -1) return;
//             result.push(s);
//             g_resultCount += 1;
//         });
//
//         const interval = setInterval(function () {
//             boradcasts.forEach(function (ip) {
//                 client.send(msg, 0, msg.length, BROADCAST_PORT, ip);
//             });
//         }, 300);
//
//         setTimeout(function() {
//             clearInterval(interval);
//             client.close();
//
//             for (const i=0; i<result.length; i++) {
//                 const ar = result[i].split(',');
//                 result[i] = {
//                     name: ar[2],
//                     mac: ar[1],
//                     ip: ar[0]
//                 };
//                 if (checkCb && !checkCb(result[i])) {
//                     result.splice(i--, 1);
//                 }
//             }
//             if(cb) cb(result);
//         }, DURATION1);
//     };
//
//
//     exports.scanForMiLightDevices = function scanForMiLightDevices (checkCb, cb) {
//         const port = 48899;
//         const ip = '255.255.255.255';
//         const result = [];
//
//         const socket = dgram.createSocket( {type: 'udp4', reuseAddr: true} );
//         socket.on('error', function (err) {
//         });
//         socket.on("listening", function (error) {
//             if (error) return cb && cb(error);
//             socket.setBroadcast(true);
//         });
//         socket.on('message', function(msg, rinfo) {
//             msg = msg.toString();
//             if (result.indexOf(msg) > -1) return;
//             result.push(msg);
//             g_resultCount += 1;
//         });
//
//         const search = function search() {
//             const pkt = new Buffer('Link_Wi-Fi');
//             socket.send(pkt, 0, pkt.length, port, ip, function(err,data) {
//             });
//         };
//         search();
//
//         setTimeout(function() {
//             socket.close();
//             for (const i=0; i<result.length; i++) {
//                 const ar = result[i].split(',');
//                 result[i] = {
//                     name: 'Mi-Light',
//                     mac: ar[1],
//                     ip: ar[0]
//                 };
//                 if (checkCb && !checkCb(result[i])) {
//                     result.splice(i--, 1);
//                 }
//             }
//             if(cb) cb(result);
//         }, DURATION2);
//
//     };
//
//     exports.scanForAllDevices = function scanForAllDevices(checkCb, cb) {
//         exports.scanForDevices(checkCb, function(result) {
//             exports.scanForMiLightDevices(checkCb, function(result2) {
//                 if (cb) cb (result.concat(result2));
//             });
//         });
//     };
//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//     const adapterName = 'wifilight';
//
//     const addInstance = function (ip, device, options, meta, callback) {
//
//         const newInstanceCount = options.newInstances.length,
//             instance = tools.findInstance(options, adapterName),
//             add = [meta.name, ip, meta.mac];
//
//         if (!instance) {
//             instance = {
//                 _id: tools.getNextInstanceID(adapterName, options),
//                 common: {
//                     name: adapterName
//                 },
//                 native: {
//                     //useSSDP: true,
//                     devices: []
//                 },
//                 comment: {
//                     add: [] //add
//                 }
//             };
//             options.newInstances.push(instance);
//         }
//         const nDevices, dev = (instance && instance.native && (nDevices = instance.native.devices) && nDevices.find(function (dev, i) {
//             return dev.ip === ip;
//         }));
//         if (!dev) {
//             dev = {
//                 ip: ip,
//                 name: meta.name,
//                 mac: meta.mac
//             };
//             nDevices.push (dev);
//
//             if (instance._existing) {
//                 options.newInstances.push (instance);
//                 instance.comment = instance.comment || {};
//             }
//             if (instance.comment.ack) instance.comment.ack = false;
//             if (instance.comment.add) {
//                 instance.comment.add.push (add.join (', '));
//             } else {
//                 instance.comment.extended = instance.comment.extended || [];
//                 instance.comment.extended.push (add.join (', '));
//             }
//         }
//         callback(null, newInstanceCount !== options.newInstances.length, ip);
//     };
//
//
// // function scanWifilight(callback) {
// //     multicastScan({
// //         ip: '255.255.255.255',
// //         port: 48899,
// //         text: "HF-A11ASSISTHREAD",
// //         broadcast: true,
// //         multicastTTL: 128
// //
// //     }, callback)
// // }
//
//     const result;
//
//     const detect = function (ip, device, options, callback) {
//
//         console.log ('discovery.wifilight: source=' + device._source + ' ip=' + ip);
//         if (device._source === undefined && ip === '127.0.0.1') {
//             // * last call, resest global vars
//             result = undefined;
//             return cb (false);
//         }
//
//         function cb (err, is) {
//             if (is === undefined) {
//                 is = err;
//                 err = null;
//             }
//             callback && callback (err, is, ip);
//             callback = null;
//         }
//
//         function doReturn () {
//             if (result) for (const i = result.length - 1; i >= 0; i--) {
//                 if (result[i].ip === ip) {
//                     const meta = result.splice (i, 1)[0];
//                     addInstance (ip, device, options, meta, cb);
//                     return;
//                 }
//             }
//             cb (false);
//         }
//
//         //if (device._source === 'upnp' || device._source === 'ip') {
//         if (device._source !== 'ping') return cb (null, false);
//         if (result) return doReturn ();
//
//         exports.scanForAllDevices (
//             function () {
//                 return true; // * true = valid
//             },
//             function (_result) {
//                 result = _result || [];
//                 doReturn ();
//             }
//         );
//     };
//
//     exports.detect = detect;
//     exports.type = ['ip'];
//     exports.timeout = 10000;
//     exports.reloadModule = true;
//
// }
//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//
//
//
//
//
