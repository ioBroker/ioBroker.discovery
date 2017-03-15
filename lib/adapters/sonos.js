var tools = require(__dirname + '/../tools.js');

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

    // sonos required web instance so check and install it too
    var webInstance = tools.findInstance(options, 'web', function (obj) {
        if (obj && obj.native && !obj.native.secure) {
            return true;
        }
    });
    var id = tools.getNextInstanceID('sonos', options);

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
    if (!instance) {
        instance = {
            _id: id,
            common: {
                name: 'sonos'
            },
            native: {
                devices: []
            },
            comment: {
                add: [],
                required: [webInstance._id]
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
        if (data && data.LOCATION && data.LOCATION.match(/^http:\/\/.+\.xml$/)) {
            tools.httpGet(data.LOCATION, function (err, _data) {
                if (_data) {
                    var mRoom = _data.match(/<roomName>(.+)<\/roomName>/);
                    var mName = _data.match(/<displayName>(.+)<\/displayName>/);
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
    // options.language - language
    
    // try to detect SONOS
    if (device._source === 'upnp' || device._source === 'ip') {
        var text =
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:reservedSSDPport\r\n' +
            'MAN: ssdp:discover\r\n' +
            'MX: 1\r\n' +
            'ST: urn:schemas-upnp-org:device:ZonePlayer:1';

        tools.ssdpScan(ip, text, function (err, result) {
            if (result && result.SERVER && result.SERVER.indexOf('Sonos') !== -1) {
                // expected:
                //    {
                //      "HTTP/1.1 200 OK": "",
                //      "CACHE-CONTROL": "max-age = 1800"
                //      "EXT:
                //      "LOCATION": "http://192.168.1.55:1400/xml/device_description.xml", 
                //      "SERVER": "Linux UPnP/1.0 Sonos/34.16-37101 (ZP90)", 
                //      "ST": "urn:schemas-upnp-org:device:ZonePlayer:1", 
                //      "USN": "uuid:RINCON_000E58A0099A04567::urn:schemas-upnp-org:device:ZonePlayer:1", 
                //      "X-RINCON-HOUSEHOLD": "Sonos_vCu667379mc1UczAwr12311234", 
                //      "X-RINCON-BOOTSEQ": "82",
                //      "X-RINCON-WIFIMODE": "0",
                //      "X-RINCON-VARIANT": "0"
                //    }
                //
                addSonos(ip, result, options, function (isAdded) {
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
    } else {
        callback(null, false, ip);
    }
}

exports.detect  = detect;
exports.type    = ['ip', 'upnp'];// make type=serial for USB sticks
exports.timeout = 1500;
