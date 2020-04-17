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
        if (instance.comment.ack) {
            instance.comment.ack = false;
        }
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
    if (metaObj && !metaObj.networkSettings) {
        addInstance(ip, device, options, metaObj, callback);
    } else {
        return callback(null, false, ip);
    }
}


exports.detect = detect;
exports.type = ['hf-lpb100', 'wifi-mi-light'];
