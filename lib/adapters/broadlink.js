'use strict';

var tools = require('../tools.js');
var dgram = require('dgram');

function getType(devType) {
    switch(devType) {
        case 0x0000: // SP1
            return 'SP1';
            break;
        case 0x2711: // SP2
        case 0x2719:
        case 0x7919:
        case 0x271a:
            return 'SP2';
        case 0x791a: // Honeywell SP2
            return 'Honeywell SP2';
        case 0x2720: // SPMini
            return 'SPMini';
        case 0x753e: // SP3
            return 'SP3';
        case 0x2728: // SPMini2
            return 'SPMini2';
        case 0x2733:
            return 'SP2';
        case 0x273e: // OEM branded SPMini
            return 'OEM branded SPMini';
        case 0x2736: // SPMiniPlus
            return 'SPMiniPlus';
        case 0x2712: // RM2
            return 'RM2';
        case 0x2737: // RM Mini
            return 'RM Mini';
        case 0x273d: // RM Pro Phicomm
            return 'RM Pro Phicomm';
        case 0x2783: // RM2 Home Plus
            return 'RM2 Home Plus';
        case 0x277c: // RM2 Home Plus GDT
            return 'RM2 Home Plus GDT';
        case 0x272a: // RM2 Pro Plus
            return 'RM2 Pro Plus';
        case 0x2787: // RM2 Pro Plus2
            return 'RM2 Pro Plus2';
        case 0x278b: // RM2 Pro Plus BL
            return 'RM2 Pro Plus BL';
        case 0x278f: // RM Mini Shate
            return 'RM Mini Shate';
        case 0x2714: // A1
            return 'A1';
        case 0x4EB5: // MP1
            return 'MP1';
        default:
            if (devType >= 0x7530 && devtype <= devType) { // OEM branded SPMini2
                return 'OEM branded SPMini2';
            } else {
                return 'Broadlink';
            }
    }
}

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language

    var name = ip;
    var timeout = setTimeout(function () {
        timeout = null;
        if (server) {
            server.close(function () {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            });
        }
    }, 500);

    var server = dgram.createSocket({type: 'udp4', reuseAddr: true});
    server.on('listening', function () {
        server.setBroadcast(true);

        var port = server.address().port;
        var now = new Date();

        var timezone = now.getTimezoneOffset() / -3600;
        var packet = Buffer.alloc(0x30, 0);
        var year = now.getYear();

        if (timezone < 0) {
            packet[0x08] = 0xff + timezone - 1;
            packet[0x09] = 0xff;
            packet[0x0a] = 0xff;
            packet[0x0b] = 0xff;
        } else {
            packet[0x08] = timezone;
            packet[0x09] = 0;
            packet[0x0a] = 0;
            packet[0x0b] = 0;
        }
        var address = ip.split('.');

        packet[0x0c] = year & 0xff;
        packet[0x0d] = year >> 8;
        packet[0x0e] = now.getMinutes();
        packet[0x0f] = now.getHours();
        packet[0x10] = year % 100; // subyear
        packet[0x11] = now.getDay();
        packet[0x12] = now.getDate();
        packet[0x13] = now.getMonth();
        packet[0x18] = parseInt(address[0]);
        packet[0x19] = parseInt(address[1]);
        packet[0x1a] = parseInt(address[2]);
        packet[0x1b] = parseInt(address[3]);
        packet[0x1c] = port & 0xff;
        packet[0x1d] = port >> 8;
        packet[0x26] = 6;
        var checksum = 0xbeaf;

        for (var i = 0; i < packet.length; i++) {
            checksum += packet[i];
        }
        checksum = checksum & 0xffff;
        packet[0x20] = checksum & 0xff;
        packet[0x21] = checksum >> 8;

        server.sendto(packet, 0, packet.length, 80, ip || '255.255.255.255');
    });

    server.on('message', function (msg, remote) {
        console.log(remote.address + ':' + remote.port + ' - ' + msg);

        var mac = Buffer.alloc ? Buffer.alloc(6, 0) : new Buffer([ 0, 0, 0, 0, 0, 0]);

        //mac = msg[0x3a:0x40];
        msg.copy(mac, 0, 0x34, 0x40);

        var devType = msg[0x34] | msg[0x35] << 8;

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        server.close(function () {
            var instance = tools.findInstance(options, 'broadlink', function (obj) {
                return obj.native.ip === ip;
            });
            if (!instance) {
                devType = getType(devType);

                options.newInstances.push({
                    _id: tools.getNextInstanceID('broadlink', options),
                    common: {
                        name: 'broadlink',
                        title: 'Broadlink (' + name + ' - ' + devType + ')'
                    },
                    native: {
                        ip: ip
                    },
                    comment: {
                        add: ['Broadlink (' + name + ' - ' + devType + ')']
                    }
                });
            }

            if (callback) {
                callback(null, !instance, ip);
                callback = null;
            }
        });
    });

    server.bind();
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks
exports.timeout = 600;
