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
    //console.log('discovery.wifilight: source=' + device._source + ' ip=' + ip + ' __wifi_mi_light=' + !!device._wifi_mi_light) ;

    //if (device._source !== 'wifi-mi-light') return callback(null, false, ip);
    if (!device._wifi_mi_light) return callback(null, false, ip);         
    addInstance (ip, device, options, device._wifi_mi_light, callback);
}


exports.detect = detect;
exports.type = ['ip'];
//exports.timeout = 2000;
//exports.reloadModule = true;
