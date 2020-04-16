'use strict';
const tools = require('../tools.js');
let mndp = require('node-mndp').NodeMndp;

function addInstance(device, options, cb){
    let instance = tools.findInstance(options, 'mikrotik', obj => obj.native.host === device.ipAddress);
    if (!instance){
        const id = tools.getNextInstanceID('mikrotik', options);
        instance = {
            _id:        id, common: {
                name:    'mikrotik',
                enabled: false,
                title:   obj => obj.common.title
            }, comment: {
                add: [device.identity + ' ' + device.version, device.ipAddress]
            }
        };
        options.newInstances.push(instance);
        instance.native = {
            'host':     device.ipAddress,
            'port':     8728,
            'login':    'admin',
            'password': '',
            'timeout':  10,
            'ch2':      true,
            'ch3':      true,
            'ch4':      true,
            'ch5':      true,
            'ch6':      true,
            'ch7':      true,
            'ch8':      true
        };
        cb && cb(true);
    } else {
        cb && cb(false);
    }
}

function detect(ip, device, options, callback){
    function cb(err, is, ip){
        if (callback){
            callback(err, is, ip);
            callback = null;
        }
    }

    const discovery = new mndp({port: 5678});
    discovery.on('deviceFound', (dev) => {
        discovery.stop();
        if (dev){
            addInstance(dev, options, (state) => {
                cb && cb(null, state, ip);
            });
        }
    });
    discovery.on('error', (e) => {
        discovery.stop();
        cb && cb(e, false, ip);
    });
    discovery.start();
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = 10000;
