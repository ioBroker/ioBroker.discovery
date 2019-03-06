'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, meta) {

    let instance = tools.findInstance(options, 'samsung', obj => obj.native.ip === ip);
    
    if (!instance) {
        const id = tools.getNextInstanceID('samsung', options);
        instance = {
            _id: id,
            common: {
                name: 'samsung'
            },
            native: {
                useSSDP: true //??
            },
            comment: {
                add: [meta.modelDescription, meta.modelName, ip]
            }
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

function createXmlRegex(names, reTest) {
    if (!Array.isArray(names)) {
        names = names.split(',');
    }
    let re = '^<\\?xml';
    for (let i = 0; i < names.length; i++) {
        re += '[\\s\\S]*?<' + names[i] + '>(.*?)</' + names[i] + '>';
    }
    re += '.*';

    const regexp = new RegExp(re, 'g');

    return function(str) {
        if (!str) return false;
        if (reTest && !reTest.test(str)) {
            return false;
        }

        const ar = regexp.exec(str);
        if (!ar || ar.length < names.length + 1) {
            return false;
        }

        const o = {};
        for (let i = 0; i < names.length; i++) {
            o[names[i]] = ar[i + 1] || '';
        }
        return o;
    }
}

const rexTest = /^<\?xml[\s\S]*?<modelDescription>Samsung TV.*?<\/modelDescription>/g;
const rexSamsung = createXmlRegex('manufacturer,modelDescription,modelName');


function detect(ip, device, options, callback) {
    let foundInstance = false;

    device._upnp.forEach(function(upnp) {
        if(upnp._location && upnp._location.indexOf("Samsung TV.") != -1) {
            //let meta = rexSamsung(upnp._location, rexTest);
            //if(meta)
            if(addInstance(ip, device, options, meta))
                foundInstance = true;
        }
    });
    
    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp']; // TODO check if upnp and location call
