'use strict';

var tools = require('../tools.js');

function addInstance(ip, device, options, meta, callback) {
    
    var instance = tools.findInstance(options, 'samsung', function (obj) {
        return obj.native.ip === ip;
    });
    
    if (!instance) {
        var id = tools.getNextInstanceID('samsung', options);
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
    var re = '^<\\?xml';
    for (var i = 0; i < names.length; i++) {
        re += '[\\s\\S]*?<' + names[i] + '>(.*?)</' + names[i] + '>';
    }
    re += '.*';

    var regexp = new RegExp(re, 'g');

    return function(str) {
        if (!str) return false;
        if (reTest && !reTest.test(str)) return false;
        var ar = regexp.exec(str);
        if (!ar || ar.length < names.length + 1) return false;
        var o = {};
        for (var i = 0; i < names.length; i++) {
            o[names[i]] = ar[i + 1] || '';
        }
        return o;
    }
}

var rexTest = /^<\?xml[\s\S]*?<modelDescription>Samsung TV.*?<\/modelDescription>/g;
var rexSamsung = createXmlRegex('manufacturer,modelDescription,modelName');


function detect(ip, device, options, callback) {

    function cb(err, is, ip) {
        callback && callback(err, is, ip);
        callback = null;
    }
    
    if (device._source === 'upnp' || device._source === 'ip') {
        var text =
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 1\r\n' +
            //'ST: urn:samsung.com:service:MultiScreenService:1\r\n' +
            'ST: urn:samsung.com:device:RemoteControlReceiver:1\r\n' +
            'USER-AGENT: Google Chrome/56.0.2924.87 Windows\r\n' +
            '\r\n';
        
        tools.ssdpScan(ip, text, true, 500, function (err, result, ip, xml) {
            if (xml) {
                var meta;
                //if (ip !== '192.168.1.63') return cb (null, false, ip);
                if (meta = rexSamsung(xml, rexTest)) {
                    addInstance (ip, device, options, meta, function (isAdded) {
                        cb (null, isAdded, ip);
                    });
                    return;
                }
                cb (null, false, ip);
            }
        });
        return;
    }
    cb(null, false, ip);
}

exports.detect = detect;
exports.type = ['ip'];
