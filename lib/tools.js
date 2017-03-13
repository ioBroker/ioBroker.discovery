var interfaces;
var Netmask = require('netmask').Netmask;
var net;
var os = require('os');
var http;
var dgram;

/**
 * Find own IP address to communicate with other device
 *
 * The server/host can have several IP addresses and to choose a valid one (e.g. to use in settings)
 * we must check all owr IP addresses.
 *
 * @alias getOwnAddress
 * @memberof tools
 * @param {string} ip ip address of device which we want to connect to
 * @return {string} own ip address of the interface which we can use to communicate with desired device
 */
function getOwnAddress(ip) {
    interfaces = interfaces || os.networkInterfaces();

    for (var k in interfaces) {

        if (!interfaces.hasOwnProperty(k)) continue;

        for (var k2 in interfaces[k]) {
            if (!interfaces[k].hasOwnProperty(k2)) continue;
            var address = interfaces[k][k2];

            if (address.family === 'IPv4') {
                var block1 = new Netmask(address.address + '/' + address.netmask);
                var block2 = new Netmask(ip + '/' + address.netmask);
                if (block1.base === block2.base) {
                    return address.address;
                }
            }
        }
    }
    return '0.0.0.0';
}

function testPort(ip, port, timeout, options, callback) {
    net = net || require('net');
    var client = new net.Socket();
    var timer;
    if (typeof timeout === 'object') {
        callback = options;
        options = timeout;
        timeout = 0;
    }
    if (typeof timeout === 'function') {
        callback = timeout;
        timeout = 0;
    }
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    options = options || {};
    timeout = timeout || 1000;

    client.on('data', function(data) {
        var noDestroy = false;
        if (options.onReceive) {
            noDestroy = options.onReceive(data, ip, port, client);
            // return true => found and destroy it
            // return undefined => not found and destroy it
            // return false => not found and destroy it
            // return null => still watching and do not destroy it
        }

        if (noDestroy !== null) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (callback) {
                callback(null, !!noDestroy, ip, port);
                callback = null;
            }
            if (client) {
                client.destroy();
                client = null;
            }
        }
    });

    client.on('error', function() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (callback) {
            callback(null, false, ip, port);
            callback = null;
        }
        if (client) {
            client.destroy();
            client = null;
        }
    });

    timer = setTimeout(function () {
        timer = null;
        if (client) {
            client.destroy();
            client = null;
        }
        if (callback) {
            callback(null, false, ip, port);
            callback = null;
        }

    }, timeout);

    client.connect(port, ip, function() {
        if (options.onConnect) {
            options.onConnect(ip, port, client);
        } else {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (callback) {
                callback(null, true, ip, port);
                callback = null;
            }
            if (client) {
                client.destroy();
                client = null;
            }
        }
    });
}

function ssdpScan(ip, st, timeout, callback) {
    if (typeof timeout === 'function') {
        callback = timeout;
        timeout = 1000;
    }
    timeout = timeout || 1000;

    dgram = dgram || require('dgram');
    var socket = dgram.createSocket('udp4');
    var timer;
    var result = [];
    // Send to port 1900 UDP request
    socket.on('error', function (err)  {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (callback) {
            callback(null, result);
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
        if (callback) {
            callback(null, msg.toString());
            callback = null;
        }
    });

    socket.bind(19123);
    var msg;
    var text = 'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:reservedSSDPport\r\n' +
        'MAN: ssdp:discover\r\n' +
        'MX: 1\r\n' +
        'ST: ' + st;
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
    }, timeout);
}

function checkEnumName(enums, name) {
    for (var enumId in enums) {
        if (!enums.hasOwnProperty(enumId)) continue;

        if (enums[enumId].common.name === name) return enumId;
        if (enums[enumId].name && enums[enumId].name === name) return enumId;
    }
    return '';
}

function getNextInstanceID(name, options) {
    var instances = [];
    if (options && options.newInstances) {
        for (var j = 0; j < options.newInstances.length; j++) {
            if (options.newInstances[j].common && options.newInstances[j].common.name === name) {
                instances.push(parseInt(options.newInstances[j]._id.substring(('system.adapter.' + name + '.').length), 10));
            }
        }
    }
    if (options && options.existingInstances) {
        for (var k = 0; k < options.existingInstances.length; k++) {
            if (options.existingInstances[k].common && options.existingInstances[k].common.name === name) {
                instances.push(parseInt(options.existingInstances[k]._id.substring(('system.adapter.' + name + '.').length), 10));
            }
        }
    }

    var instance = 0;
    while (instances.indexOf(instance) !== -1) {
        instance++;
    }
    return 'system.adapter.' + name + '.' + instance;
}

function findInstance(options, name, compare) {
    var i;
    var instance = null;
    for (i = 0; i < options.existingInstances.length; i++) {
        if (options.existingInstances[i].common && options.existingInstances[i].common.name === name &&
            (!compare || compare(options.existingInstances[i]))) {
            instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
            instance._existing = true;
            break;
        }
    }

    for (i = 0; i < options.newInstances.length; i++) {
        if (options.newInstances[i].common && options.newInstances[i].common.name === name &&
            (!compare || compare(options.newInstances[i]))) {
            instance = options.newInstances[i];
            break;
        }
    }
    return instance;
}

function httpGet(link, callback) {
    http = http || require('http');

    http.get(link, function (res) {
        var statusCode = res.statusCode;

        if (statusCode !== 200) {
            // consume response data to free up memory
            res.resume();
            callback(statusCode, null, link);
        }

        res.setEncoding('utf8');
        var rawData = '';
        res.on('data', function (chunk) {
            rawData += chunk;
        });
        res.on('end', function () {
            callback(null, rawData ? rawData.toString() : null, link);
        });
    }).on('error', function (e) {
        callback(e.message, null, link);
    });
}
var words = require(__dirname + '/../admin/words.js');

exports.getOwnAddress     = getOwnAddress;
exports.testPort          = testPort;
exports.getNextInstanceID = getNextInstanceID;
exports.findInstance      = findInstance;
exports.checkEnumName     = checkEnumName;
exports.httpGet           = httpGet;
exports.ssdpScan          = ssdpScan;
exports.translate         = require(__dirname + '/../admin/words.js').translate;
exports.words             = require(__dirname + '/../admin/words.js').words;
