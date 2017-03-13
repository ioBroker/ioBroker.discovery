var tools = require(__dirname + '/../tools.js');
var dgram;
var _ = tools.translate;
function insertDevice(options, instance, fromOldInstances, ip, name, room) {
    // find unique name
    var i = '';
    var found;

    do {
        found = false;
        for (var d = 0; d < instance.native.devices.length; d++) {
            if (instance.native.devices[d].name === name + i) {
                found = true;
                break;
            }
        }
        if (!found) break;
        if (!i) {
            i = 1;
        } else {
            i++;
        }
    } while(found);

    name = name + i;

    var device = {
        ip:   ip,
        name: name,
        room: tools.checkEnumName(options.enums['enum.rooms'], room || '')
    };

    instance.native.devices.push(device);

    if (fromOldInstances) {
        options.newInstances.push(instance);
        instance.comment = instance.comment || {};
    }
    if (!instance.comment.add) {
        instance.comment.extended = instance.comment.extended || [];
        instance.comment.extended.push(device.ip + ' - ' + device.name);
    } else {
        instance.comment.add.push(device.ip + ' - ' + device.name);
    }
}

function addChromecast(ip, device, options, callback) {
    var instance = tools.findInstance(options, 'chromecast');

    // chromecast required web instance so check and install it too
    var webInstance = tools.findInstance(options, 'web', function (obj) {
        if (obj && obj.native && !obj.native.secure) {
            return true;
        }
    });
    if (!instance) {
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

        instance = {
            _id: id,
            common: {
                name: 'chromecast'
            },
            native: {
                useSSDP: true,
                web: webInstance._id,
                webServer: tools.getOwnAddress(ip)
            },
            comment: {
                add: [],
                required: [webInstance._id]
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

    if (device._source === 'upnp' || device._source === 'ip') {
        tools.ssdpScan(ip, 'urn:dial-multiscreen-org:service:dial:1', 1000, function (msg) {
            if (msg) {
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

                if (msg.toString().indexOf('device-desc.xml') !== -1) {
                    addChromecast(ip, device, options, function (isAdded) {
                        callback(null, isAdded, ip);
                    });
                } else {
                    callback(null, false, ip);
                }
            } else {
                callback(null, false, ip);
           }
        });
    } else {
        callback(null, false, ip);
    }
    /*dgram = dgram || require('dgram');
    var socket = dgram.createSocket('udp4');
    var timer;
    // try to detect SONOS
    if (device._source === 'upnp' || device._source === 'ip') {
        // Send to port 1900 UDP request
        socket.on('error', function (err)  {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
            if (socket) {
                socket.close();
                socket = null;
            }
        });

        socket.on('message', function (msg, rinfo) {
            // expected:
            // HTTP/1.1 200 OK
            // CACHE-CONTROL: max-age = 1800
            // EXT:
            // LOCATION: http://192.168.1.55:1400/xml/device_description.xml
            // SERVER: Linux UPnP/1.0 Sonos/34.16-37101 (ZP90)
            // ST: urn:schemas-upnp-org:device:ZonePlayer:1
            // USN: uuid:RINCON_000E58A0086A01400::urn:schemas-upnp-org:device:ZonePlayer:1
            // X-RINCON-HOUSEHOLD: Sonos_vCu667379mc1UczAwr01y1ErSp
            // X-RINCON-BOOTSEQ: 82
            // X-RINCON-WIFIMODE: 0
            // X-RINCON-VARIANT: 0
            //

            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (socket) {
                socket.close();
                socket = null;
            }
            msg = msg ? msg.toString() : '';
            if (msg && msg.toString().indexOf('Sonos') !== -1) {
                addSonos(ip, msg, options, function (isAdded) {
                    if (callback) {
                        callback(null, isAdded, ip);
                        callback = null;
                    }
                });
            } else {
                if (callback) {
                    callback(null, false, ip);
                    callback = null;
                }
            }
        });

        socket.bind(19123);
        var msg;
        var text = 'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:reservedSSDPport\r\n' +
            'MAN: ssdp:discover\r\n' +
            'MX: 1\r\n' +
            'ST: urn:schemas-upnp-org:device:ZonePlayer:1';
        if (parseInt(process.version.substring(1), 10) < 6) {
            msg = new Buffer(text);
        } else {
            msg = Buffer.from(text);
        }

        socket.send(msg, 0, msg.length, 1900, ip);

        timer = setTimeout(function () {
            timer = null;
            if (socket) {
                socket.close();
                socket = null;
            }
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        }, 2000);
    } else {
        callback(null, false, ip);
    }*/
    setTimeout(function () {
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
