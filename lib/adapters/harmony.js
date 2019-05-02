'use strict';

const tools = require('../tools.js');

function addHarmony(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'harmony', obj => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('harmony', options),
            common: {
                name: 'harmony'
            },
            native: {},
            comment: {
                add: 'harmony'
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
} // endAddHarmony

function addFakeroku(ip, device, options, callback) {
    let instance = tools.findInstance(options, 'fakeroku', obj => true);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('fakeroku', options),
            common: {
                name: 'fakeroku'
            },
            native: {},
            comment: {
                add: 'fakeroku',
            }
        };
        options.newInstances.push(instance);
        return true;
    } else {
        return false;
    }
} // endAddFakeroku

// Detects Logitech Harmony + Fakeroku
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(function(upnp) {
        if(upnp.USN && upnp.USN.includes('myharmony-com:device'))
        {
            options.log.debug('Harmony Hub detected at: ' + ip);
            if(addHarmony(ip, device, options) || addFakeroku(ip, device, options))
                foundInstance = true;
        }
    });

    callback(null, foundInstance, ip);
} // endDetect


exports.detect = detect;
exports.type = ['upnp']; // make type=serial for USB sticks
exports.timeout = 100;