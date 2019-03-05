'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, meta, callback) {

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
        return callback(true);
    }
    callback(false);
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

    function cb(err, is, ip) {
        callback && callback(err, is, ip);
        callback = null;
    }
    
    if (device._source === 'upnp' || device._source === 'ip') {
        const text =
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 1\r\n' +
            //'ST: urn:samsung.com:service:MultiScreenService:1\r\n' +
            'ST: urn:samsung.com:device:RemoteControlReceiver:1\r\n' +
            'USER-AGENT: Google Chrome/56.0.2924.87 Windows\r\n' +
            '\r\n';

        tools.ssdpScan(ip, text, true, 500, (err, result, ip, xml) => {
            let meta = xml && rexSamsung(xml, rexTest);
            //if (ip !== '192.168.1.63') return cb (null, false, ip);
            if (meta) {
                addInstance(ip, device, options, meta, isAdded => cb(null, isAdded, ip));
            } else {
                cb (null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip']; // TODO check if upnp and location call
