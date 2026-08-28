////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// from wifilight adapter (lib/discovery.js)

import * as dgram from 'node:dgram';
import type { MethodInstance, ProtocolData } from '../types';
//     os = require('node:os'),
//     Netmask = require('netmask').Netmask;

// const BROADCAST_PORT = 48899;
// let g_resultCount = 0;

const DURATION1 = 7000;
const DURATION2 = 2000;

// This is now part of HF-LPB100
// exports.scanForDevices = function (checkCb, cb) {

//     const BC_ID = 'HF-A11ASSISTHREAD'; //V6 API
//     const msg = Buffer.from(BC_ID);
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
//     const result: ProtocolData[] = [];
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
//         boradcasts.forEach(ip =>
//             client.send(msg, 0, msg.length, BROADCAST_PORT, ip));
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
export const scanForMiLightDevices = function scanForMiLightDevices(
    checkCb: (...args: any[]) => unknown,
    cb: (...args: any[]) => void,
): void {
    const port = 48899;
    const ip = '255.255.255.255';
    const result: ProtocolData[] = [];

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', (/* err */): void => {});

    socket.on('listening', (error: unknown): void => {
        if (error) {
            return cb?.(error);
        }
        socket.setBroadcast(true);
    });
    socket.on('message', (raw /* , rinfo */): void => {
        const msg = raw.toString();
        if (result.includes(msg)) {
            return;
        }
        result.push(msg);
        // g_resultCount += 1;
    });

    const search = function search(): void {
        const pkt = Buffer.from('Link_Wi-Fi');
        socket.send(pkt, 0, pkt.length, port, ip, (/* err, data */): void => {});
    };
    search();

    setTimeout((): void => {
        socket.close();
        for (let i = 0; i < result.length; i++) {
            const ar = result[i].split(',');
            result[i] = {
                name: 'Mi-Light',
                mac: ar[1],
                ip: ar[0],
            };
            if (checkCb && !checkCb(result[i])) {
                result.splice(i--, 1);
            }
        }
        cb?.(result);
    }, DURATION2);
};

export const scanForAllDevices = function scanForAllDevices(
    checkCb: (...args: any[]) => unknown,
    cb: (...args: any[]) => void,
): void {
    // exports.scanForDevices(checkCb, function(result) {
    scanForMiLightDevices(checkCb, (result2: ProtocolData): void => cb?.(/*result.concat( */ result2 /*)*/));
    // });
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const methodName = 'wifi-mi-light';

function discover(self: MethodInstance): void {
    self.setTimeout(DURATION1 + DURATION2, { timeout: false });

    self.adapter.log.info(`Discovering ${methodName} devices...`);
    scanForAllDevices(
        (/* entry */): boolean => true,
        (result: ProtocolData): void => {
            result.forEach((entry: ProtocolData): void => {
                self.addDevice({
                    //_data: { address: entry.ip }, // really necessary?
                    _addr: entry.ip,
                    _name: entry.name,
                    _wifi_mi_light: {
                        mac: entry.mac,
                        name: entry.name,
                    },
                });
            });
            self.done();
        },
    );
}

export const browse = discover;
export const type = 'wifi-mi-light';
export const source = methodName;

export const options = {
    mdnsTimeout: {
        min: 10000,
        max: 60000,
        type: 'number',
    },
};
