'use strict';

var tools = require('../tools.js');

var adapterName = 'lightify';

function detectLightify(ip, callback) {
    tools.testPort(ip, 4000, 1000, {
        onConnect: function(ip, port, client) {
            //send getStatus for group all. Will return an error
            client.write(new Buffer('0e00006802000000ffffffffffffffff', 'hex'));
        },
        onReceive: function(data) {
            var expectedLen = data.readUInt16LE(0) + 2;
            var fail = data.readUInt8(8);
            return (expectedLen === data.length && fail === 21); // error, getStatus not allowed für groups
        }},
        callback
    );

}

//var lightifyDetected = false;
//var devices = {};

function detect(ip, device, options, callback) {
    if (device._source !== 'mdns') return callback(null, false, ip);
    
    //console.log('lightify.detect: ' + device._source + ' ip=' + ip + ' ' + device._name + ' mdns: ' + device._mdns);
    
    detectLightify(ip, function(err, found) {
        if (!found) {
            return callback(null, false, ip);
        }
        var instance = tools.findInstance (options, adapterName, function (obj) {
            return obj.native.ip === ip;
        });
        if (!instance) {
            var name = device._name ? device._name : '';
            instance = {
                _id: tools.getNextInstanceID (adapterName, options),
                common: {
                    name: adapterName,
                    title: 'Lightify (' + ip + (name ? (' - ' + name) : '') + ')'
                },
                native: {
                    ip: ip
                },
                comment: {
                    add: [name, ip]
                }
            };
            options.newInstances.push (instance);
            return callback (null, true, ip);
        }
        return callback(null, false, ip);
    });
    
    // if (device._name.toLowerCase().indexOf('lightify') >= 0) {
    // }
    
    // if (device._source === undefined && ip === '127.0.0.1') {
    //     devices = {};
    //     lightifyDetected = false;
    //     // last call
    // }
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
//exports.reloadModule = true;
