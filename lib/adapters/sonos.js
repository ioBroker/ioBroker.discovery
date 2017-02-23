var tools = require(__dirname + '/../tools.js');
var dgram;
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
        instance.comment.extended.push(device.name);
    } else {
        instance.comment.add.push(device.name);
    }
}

function addSonos(ip, data, options, callback) {
    var instance;
    var fromOldInstances = false;
    for (var j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === 'sonos') {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (var i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'sonos') {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                fromOldInstances = true;
                break;
            }
        }
    }

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('sonos', options),
            common: {
                name: 'sonos'
            },
            native: {
                devices: []
            },
            comment: {
                add: []
            }
        };
        options.newInstances.push(instance);
    }

    var isNew = false;
    var found = false;
    for (var d = 0; d < instance.native.devices.length; d++) {
        if (instance.native.devices[d].ip === ip) {
            found = true;
            break;
        }
    }

    if (!found) {
        var link;
        var lines = data.split('\r\n');
        for (var k = 0; k < lines.length; k++) {
            var parts = lines[k].split('LOCATION:');
            if (parts.length > 1) {
                link = parts[1].trim();
                break;
            }
        }
        if (link && link.match(/^http:\/\/.+\.xml$/)) {
            tools.httpGet(link, function (err, data) {
                if (data) {
                    var mRoom = data.match(/<roomName>(.+)<\/roomName>/);
                    var mName = data.match(/<displayName>(.+)<\/displayName>/);
                    var name;
                    var room;
                    if (mRoom && mRoom[1]) {
                        room = mRoom[1];
                    }
                    if (mName && mName[1]) {
                        name = mName[1].replace(/[.:]/g, '_');
                    }
                    insertDevice(options, instance, fromOldInstances, ip, name, room);
                } else {
                    insertDevice(options, instance, fromOldInstances, ip);
                }
                callback(isNew);
            });
        } else {
            insertDevice(options, instance, fromOldInstances, ip);
            callback(isNew);
        }
    } else {
        callback(isNew);
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

    dgram = dgram || require('dgram');
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
            /* expected:
             HTTP/1.1 200 OK
             CACHE-CONTROL: max-age = 1800
             EXT:
             LOCATION: http://192.168.1.55:1400/xml/device_description.xml
             SERVER: Linux UPnP/1.0 Sonos/34.16-37101 (ZP90)
             ST: urn:schemas-upnp-org:device:ZonePlayer:1
             USN: uuid:RINCON_000E58A0086A01400::urn:schemas-upnp-org:device:ZonePlayer:1
             X-RINCON-HOUSEHOLD: Sonos_vCu667379mc1UczAwr01y1ErSp
             X-RINCON-BOOTSEQ: 82
             X-RINCON-WIFIMODE: 0
             X-RINCON-VARIANT: 0
             */

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
        var msg = Buffer.from(
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:reservedSSDPport\r\n' +
            'MAN: ssdp:discover\r\n' +
            'MX: 1\r\n' +
            'ST: urn:schemas-upnp-org:device:ZonePlayer:1');

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
    }
}

exports.detect = detect;
exports.type = ['ip', 'upnp'];// make type=serial for USB sticks
