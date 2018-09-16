'use strict';

var tools = require('../tools.js');
const url = require('url');
// based on epson_stylus_px380
var adapterName = 'klf200';

function detect(ip, device, options, callback) {
    if (device._source !== 'ping') return callback(null, false, ip);

    tools.httpGet('http://' + ip + '/languages/de.json', 1000, function (err, data) {
        if (!err && data) {
            try {
                data = JSON.parse(data);
            } catch (e) {
                data = {};
            }
            if ("KLF 200" == data["auth.pageTitle"]) {
                var instance = tools.findInstance (options, adapterName, function (obj) {
                    let hostUrl = url.parse(obj.native.host);
                    return (hostUrl.hostname === ip || hostUrl.hostname.localeCompare(device._name, undefined, {sensitivity: "base"}) === 0);
                });
                if (!instance) {
                    var name = device._name ? device._name : ip;
                    instance = {
                        _id: tools.getNextInstanceID (adapterName, options),
                        common: {
                            name: adapterName,
                            title: 'KLF-200'
                        },
                        native: {
                            "host": "http://" + name,
                            "password": "velux123",
                            "pollInterval": 60
                        },
                        comment: {
                            add: [name, ip]
                        }
                    };
                    options.newInstances.push (instance);
                    return callback (null, true, ip);
                }
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
