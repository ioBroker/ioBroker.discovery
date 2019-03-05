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
        callback(true);
    } else {
        callback(false);
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
        callback(true);
    } else {
        callback(false);
    }
} // endAddFakeroku

// Detects Logitech Harmony + Fakeroku
function detect(ip, device, options, callback) {
    if (device._upnp && device._upnp['USN'] && device._upnp['USN'].includes('myharmony-com:device')) {
        options.log.debug('Harmony Hub detected at: ' + ip);
        addHarmony(ip, device, options, callback);
        addFakeroku(ip, device, options, callback);
    } else {
        return callback(null, false, ip);
    } // endElse
} // endDetect


exports.detect = detect;
exports.type = ['upnp']; // make type=serial for USB sticks
exports.timeout = 5000;