'use strict';

const tools = require('../tools.js');

function addHarmony(ip, device, options) {
    let instance = tools.findInstance(options, 'harmony', () => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('harmony', options),
            common: {
                name: 'harmony',
            },
            native: {},
            comment: {
                add: 'harmony',
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
} // endAddHarmony

function addFakeroku(ip, device, options) {
    let instance = tools.findInstance(options, 'fakeroku', () => true);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('fakeroku', options),
            common: {
                name: 'fakeroku',
            },
            native: {},
            comment: {
                add: 'fakeroku',
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
} // endAddFakeroku

// Detects Logitech Harmony + Fakeroku
function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(upnp => {
        if (!foundInstance && upnp.USN && upnp.USN.includes('myharmony-com:device')) {
            options.log.debug(`Harmony Hub detected at: ${ip}`);
            const addHarmonyDev = addHarmony(ip, device, options);
            const addFakerokuDev = addFakeroku(ip, device, options);
            if (addHarmonyDev || addFakerokuDev) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
} // endDetect

exports.detect = detect;
exports.type = ['upnp']; // make type=serial for USB sticks
exports.timeout = 100;
