'use strict';

const tools = require('../tools.js');

const adapterName = 'lightify';

function detectLightify(ip, callback) {
    tools.testPort(ip, 4000, 1000, {
        onConnect: (ip, port, client) => {
            //send getStatus for group all. Will return an error
            client.write(Buffer.from('0e00006802000000ffffffffffffffff', 'hex'));
        },
        onReceive: data => {
            const expectedLen = data.readUInt16LE(0) + 2;
            const fail = data.readUInt8(8);
            return expectedLen === data.length && fail === 21; // error, getStatus not allowed für groups
        }},
    callback
    );

}

//const lightifyDetected = false;
//const devices = {};

function detect(ip, device, options, callback) {
    
    detectLightify(ip, (err, found) => {
        if (!found) {
            return callback(null, false, ip);
        }

        let instance = tools.findInstance (options, adapterName, obj => obj.native.ip === ip);

        if (!instance) {
            const name = device._name ? device._name : '';
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
exports.type = ['mdns'];
exports.timeout = 1500;
//exports.reloadModule = true;
