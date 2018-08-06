'use strict';

var tools = require(__dirname + '/../tools.js');

function addChromecast(ip, device, options, callback) {
    var ownIp = tools.getOwnAddress(ip);

    var instance = tools.findInstance(options, 'chromecast', function (obj) {
        if (obj && obj.native && (obj.native.webServer === ownIp || obj.native.webServer === device._name)) {
            return true;
        }
    });

    if (!instance) {
        // chromecast required web instance so check and install it too
        var webInstance = tools.findInstance(options, 'web');
        var visInstance = tools.findInstance(options, 'vis');

        var id = tools.getNextInstanceID('chromecast', options);

        if (!webInstance) {
            webInstance = {
                _id: tools.getNextInstanceID('web', options),
                common: {
                    name: 'web',
                    title: 'ioBroker web Adapter with no security'
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))]
                }
            };
            options.newInstances.push(webInstance);
        }

        if (!visInstance) {
            visInstance = {
                _id: tools.getNextInstanceID('vis', options),
                common: {
                    name: 'vis',
                    title: 'ioBroker vis Adapter'
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))],
                    required: [webInstance._id]
                }
            };
            options.newInstances.push(visInstance);
        }

        instance = {
            _id: id,
            common: {
                name: 'chromecast'
            },
            native: {
                useSSDP: true,
                web: webInstance._id,
                webServer: ownIp
            },
            comment: {
                add: [tools.translate(options.language, 'for %s', tools.getOwnAddress(ip))],
                required: [webInstance._id, visInstance._id]
            }
        };
        options.newInstances.push(instance);
        callback(true);
    } else {
        callback(false);
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }
    // options.language - language

    if (device._type === 'ip') {
        var text =
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 1\r\n' +
            'ST: urn:dial-multiscreen-org:service:dial:1\r\n' +
            'USER-AGENT: Google Chrome/56.0.2924.87 Windows\r\n' +
            '\r\n';

        tools.ssdpScan(ip, text, true, 500, function (err, result, ip, xml) {
            if (xml) {
                // HTTP/1.1 200 OK
                // CACHE-CONTROL: max-age=1800
                // DATE: Mon, 13 Mar 2017 23:02:46 GMT
                // EXT:
                // LOCATION: http://192.168.1.67:8008/ssdp/device-desc.xml
                // OPT: "http://schemas.upnp.org/upnp/1/0/"; ns=01
                // 01-NLS: a0cb1234-1dd1-11b2-1234-ee761d6e1234
                // SERVER: Linux/3.8.13+, UPnP/1.0, Portable SDK for UPnP devices/1.6.18
                // X-User-Agent: redsonic
                // ST: urn:dial-multiscreen-org:service:dial:1
                // USN: uuid:e55d9ABC-6d8e-1234-5678-424962ea6FFF::urn:dial-multiscreen-org:service:dial:1
                // BOOTID.UPNP.ORG: 435
                // CONFIGID.UPNP.ORG: 4
                if (xml.indexOf('Chromecast') !== -1) {
                    addChromecast(ip, device, options, function (isAdded) {
                        callback && callback(null, isAdded, ip);
                        callback = null;
                    });
                } else {
                    callback && callback(null, false, ip);
                    callback = null;
                }
            } else {
                callback && callback(null, false, ip);
                callback = null;
            }
        });
    } else {
        callback && callback(null, false, ip);
        callback = null;
    }
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
