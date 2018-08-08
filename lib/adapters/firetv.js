'use strict';

var tools = require('../tools.js');

var adapterName = 'firetv';

function addInstance(ip, device, options, meta, callback) {
    
    var newInstanceCount = options.newInstances.length,
        instance = tools.findInstance(options, adapterName),
        add = [device._name, ip];
    
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
            name: device._name
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

var reamzn = /^amzn\.dmgr:/;
var isamzn = reamzn.test.bind(reamzn);

function detect(ip, device, options, callback) {
    
    //console.log('firetv.detect: ' + device._source + ' ip=' + ip + ' ' + device._name + ' _mdns: ' + !!device._mdns);
    var ptr, srv, found;
    if (!device._mdns) return callback(null, false, ip);
    found = (ptr = device._mdns.PTR) && (isamzn (ptr.data) || isamzn (ptr.name));
    found = found || (srv = device._mdns.SRV) && isamzn(srv.name);
    if (!found) return callback(null, false, ip);
    
    addInstance (ip, device, options, device._mdns, callback);
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
