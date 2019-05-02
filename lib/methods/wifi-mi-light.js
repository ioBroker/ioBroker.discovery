'use strict';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// from wifilight adapter (lib/discovery.js)

const dgram = require('dgram');
//     os = require('os'),
//     Netmask = require('netmask').Netmask;

// const BROADCAST_PORT = 48899;
let g_resultCount = 0;

const DURATION1 = 7000;
const DURATION2 = 2000;

// This is now part of HF-LPB100
// exports.scanForDevices = function (checkCb, cb) {

//     const BC_ID = 'HF-A11ASSISTHREAD'; //V6 API
//     const msg = new Buffer(BC_ID);
//     const boradcasts = [];
//     const ifaces = os.networkInterfaces();

//     for (const name in ifaces) {
//         ifaces[name].forEach(function (iface) {
//             if ('IPv4' !== iface.family || iface.internal) {
//                 return;
//             }
//             const netmask = new Netmask(iface.address, iface.netmask);
//             boradcasts.push(netmask.broadcast);
//         })
//     }
//     const result = [];
//     const client = dgram.createSocket('udp4');
//     client.bind(BROADCAST_PORT);
//     client.on('listening', function () {
//         client.setBroadcast(true);
//     });
//     client.on('message', function (message, rinfo) {
//         const s = message.toString();
//         if (rinfo.port !== BROADCAST_PORT || s === BC_ID || s.indexOf('+ERR') === 0) {
//             return;
//         }
//         if (result.indexOf(s) > -1) return;
//         result.push(s);
//         g_resultCount += 1;
//     });

//     const interval = setInterval(function () {
//         boradcasts.forEach(function (ip) {
//             client.send(msg, 0, msg.length, BROADCAST_PORT, ip);
//         });
//     }, 300);

//     setTimeout(function() {
//         clearInterval(interval);
//         client.close();

//         for (const i=0; i<result.length; i++) {
//             const ar = result[i].split(',');
//             result[i] = {
//                 name: ar[2],
//                 mac: ar[1],
//                 ip: ar[0]
//             };
//             if (checkCb && !checkCb(result[i])) {
//                 result.splice(i--, 1);
//             }
//         }
//         if(cb) cb(result);
//     }, DURATION1);
// };

/** Scans for legacy (v5) MiLight devices */
exports.scanForMiLightDevices = function scanForMiLightDevices(checkCb, cb) {
    const port = 48899;
    const ip = '255.255.255.255';
    const result = [];

    const socket = dgram.createSocket({type: 'udp4', reuseAddr: true});
    socket.on('error', err => {});

    socket.on('listening', error => {
        if (error) {
            return cb && cb(error);
        }
        socket.setBroadcast(true);
    });
    socket.on('message', (msg, rinfo) => {
        msg = msg.toString();
        if (result.indexOf(msg) > -1) return;
        result.push(msg);
        g_resultCount += 1;
    });

    const search = function search() {
        const pkt = new Buffer('Link_Wi-Fi');
        socket.send(pkt, 0, pkt.length, port, ip, (err, data) => {});
    };
    search();

    setTimeout(() => {
        socket.close();
        for (let i = 0; i < result.length; i++) {
            const ar = result[i].split(',');
            result[i] = {
                name: 'Mi-Light',
                mac: ar[1],
                ip: ar[0]
            };
            if (checkCb && !checkCb(result[i])) {
                result.splice(i--, 1);
            }
        }
        if (cb) cb(result);
    }, DURATION2);

};

exports.scanForAllDevices = function scanForAllDevices(checkCb, cb) {
    // exports.scanForDevices(checkCb, function(result) {
    exports.scanForMiLightDevices(checkCb, result2 => {
        cb && cb(/*result.concat( */ result2 /*)*/);
    });
    // });
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const methodName = 'wifi-mi-light';

function discover(self) {

    self.setTimeout((DURATION1 + DURATION2), {timeout: false});

    self.adapter.log.info('Discovering ' + methodName + ' devices...');
    exports.scanForAllDevices(
        entry => true,
        result => {
            result.forEach(entry => {
                self.addDevice({
                    //_data: { address: entry.ip }, // realy necessary?
                    _addr: entry.ip,
                    _name: entry.name,
                    _wifi_mi_light: {
                        mac: entry.mac,
                        name: entry.name
                    }
                });
            });
            self.done();
        }
    );
}

exports.browse = discover;
exports.type = 'wifi-mi-light';
exports.source = methodName;

exports.options = {
    mdnsTimeout: {
        min: 10000,
        max: 60000,
        type: 'number'
    }
};


