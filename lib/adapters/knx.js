'use strict';

var tools = require('../tools.js');
var dgram = require('dgram');

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language

    var name = ip;
    var request = [6,16,2,5,0,26,8,1,192,168,60,102,0,0,8,1,192,168,60,102,0,0,4,4,2,0];

    var ownIp = tools.getOwnAddress(ip);
    var parts = ownIp.split('.');
    request[8] = parseInt(parts[0], 10);
    request[9] = parseInt(parts[1], 10);
    request[10] = parseInt(parts[2], 10);
    request[11] = parseInt(parts[3], 10);

    request[16] = request[8];
    request[17] = request[9];
    request[18] = request[10];
    request[19] = request[11];

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

    var server = dgram.createSocket('udp4');
    server.on('listening', function () {
        //var address = server.address();
        //console.log('UDP Server listening on ' + address.address + ":" + address.port);
        // send connect request
        server.send(new Buffer(request), 0, request.length, 3671, ip, function(err, bytes) {
            if (err) throw err;
        });
    });

    server.on('message', function (message, remote) {
        console.log(remote.address + ':' + remote.port +' - ' + message);
        // var response = [6,16,2,6,0,20,1,0,8,1,192,168,60,129,14,87,4,4,17,4];
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        if (message && message[2] === 2 && message[3] === 6) { // if CONNECT_RESPONSE:  0x0206,
            var disconnect = [6,16,2,9,0,16,1,0,8,1,192,168,60,102,0,0];
            disconnect[10] = message[10];
            disconnect[11] = message[11];
            disconnect[12] = message[12];
            disconnect[13] = message[13];

            server.send(new Buffer(disconnect), 0, disconnect.length, 3671, ip, function (err) {
                server.close(function () {
                    var instance = tools.findInstance(options, 'knx', function (obj) {
                        return obj.native.gwip === ip && obj.native.gwipport === 3671;
                    });
                    if (!instance) {
                        //adapter.log.warn(' KNX-Filter : ' + tools.getNextInstanceID('knx', options));
                        options.newInstances.push({
                            _id: tools.getNextInstanceID('knx', options),
                            common: {
                                name: 'knx',
                                title: 'KNX-LAN GW TCP (' + name + ':3671)'
                            },
                            native: {
                                gwip: ip,
                                gwipport: 3671,
                                eibadr: '1.1.1'
                            },
                            comment: {
                                add: ['KNX-LAN GW TCP (' + name + ':3671)'],
                                showConfig: true
                            }
                        });
                    }

                    if (callback) {
                        callback(null, !instance, ip);
                        callback = null;
                    }
                });
            });
        } else {
            server.close(function () {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            });
        }
    });

    server.bind();
}

exports.detect  = detect;
exports.type    = 'ip';// make type=serial for USB sticks
exports.timeout = 600;
