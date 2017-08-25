var interfaces;
var Netmask = require('netmask').Netmask;
var net;
var os = require('os');
var http;
var dgram;
var SerialPort;
var udp = require("dgram");

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

/**
 * Test TCP port of IP address.
 *
 * This function tries to open given TCP port and if onConnect and onReceive are defined, the user can send some data in onConnect and to check it in onReceive.
 *
 * @alias testPort
 * @memberof tools
 * @param {string} ip ip address
 * @param {number} port TCP port
 * @param {number} timeout timeout in ms (default 500)
 * @param {object} options object like {onConnect: function (ip, port, client) {}, onReceive: function (data, ip, port, client) {}}
 *  Example:
 *  <pre><code>
 *     {
 *       onConnect: function (ip, port, client) {
 *           // you can send here some request
 *           client.write(
 *               'POST / HTTP/1.1\r\n' +
 *               'User-Agent: NodeJS XML-RPC Client\r\n' +
 *               'Content-Type: text/xml\r\n' +
 *               'Accept: text/xml\r\n' +
 *               'Accept-Charset: UTF8\r\n' +
 *               'Connection: Keep-Alive\r\n' +
 *               'Content-Length: 98\r\n' +
 *               'Host: ' + ip + ':' + port + '\r\n' +
 *               '\r\n' +
 *               '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
 *       },
 *       onReceive: function (data, ip, port, client) {
 *           // return true => found and destroy it
 *           // return undefined => not found and destroy it
 *           // return false => not found and destroy it
 *           // return null => still watching and do not destroy it
 *           return data && !!data.toString().match(/<value>[.\d]+<\/value>/);
 *       }
 *   }
 *  </code></pre>
 * @param {function} callback return result
 *        <pre><code>function (error, found, ip, port) {}</code></pre>
 */
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
    timeout = timeout || 500;

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

var usedPorts = [];
/**
 * Helper function scan UPnP devices.
 *
 * First of all it sends UDP Multicast to detect devices with defined ST to port 1900.
 *
 * The answer will be parsed in form:
 * <pre><code>
 *    {
 *      "HTTP/1.1 200 OK": "",
 *      "CACHE-CONTROL": "max-age = 1800"
 *      "EXT:
 *      "LOCATION": "http://192.168.1.55:1400/xml/device_description.xml",
 *      "SERVER": "Linux UPnP/1.0 Sonos/34.16-37101 (ZP90)",
 *      "ST": "urn:schemas-upnp-org:device:ZonePlayer:1",
 *      "USN": "uuid:RINCON_000E58A0099A04567::urn:schemas-upnp-org:device:ZonePlayer:1",
 *      "X-RINCON-HOUSEHOLD": "Sonos_vCu667379mc1UczAwr12311234",
 *      "X-RINCON-BOOTSEQ": "82",
 *      "X-RINCON-WIFIMODE": "0",
 *      "X-RINCON-VARIANT": "0"
 *    }
 * </code></pre>
 * If readXml is enabled and result.LOCATION exists, so this location will be read and delivered as xmlData.
 * You can call the function with object too
 * <pre><code>
 *   ssdpScan({ip: '192.168.1.3', st: 'urn:dial-multiscreen-org:service:dial:1', readXml: true}, function (error, result, ip, xmlData) {
 *      if (result) console.log('Found UPnP device');
 *   });
 * </code></pre>
 *
 * @alias ssdpScan
 * @memberof tools
 * @param {string} ip ip address of target device
 * @param {string} st filter string like "urn:dial-multiscreen-org:service:dial:1"
 * @param {boolean} readXml if LOCATION xml should be read
 * @param {boolean} timeout timeout in ms (default 1000)
 * @param {function} callback return result
 *        <pre><code>function (error, result, ip, xmlData) {}</code></pre>
 */
function ssdpScan(ip, text, readXml, timeout, callback) {
    if (typeof ip === 'object') {
        callback = text;
        text = ip.text;
        readXml = ip.readXml;
        timeout = ip.timeout;
        ip = ip.ip;
    }
    if (typeof readXml === 'function') {
        callback = readXml;
        readXml = false;
    }
    if (typeof readXml === 'number') {
        timeout = readXml;
        readXml = false;
    }
    if (typeof timeout === 'function') {
        callback = timeout;
        timeout = 1000;
    }
    timeout = timeout || 1000;

    dgram = dgram || require('dgram');
    var socket = dgram.createSocket('udp4');
    var timer;
    var port = 19140;
    while (usedPorts.indexOf(port) !== -1) port++;
    usedPorts.push(port);
    var result = [];
    // Send to port 1900 UDP request
    socket.on('error', function (err)  {
        var pos = usedPorts.indexOf(port);
        if (pos !== -1) usedPorts.splice(pos, 1);
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
         USN: uuid:RINCON_000E58A0099A04567::urn:schemas-upnp-org:device:ZonePlayer:1
         X-RINCON-HOUSEHOLD: Sonos_vCu667379mc1UczAwr12311234
         X-RINCON-BOOTSEQ: 82
         X-RINCON-WIFIMODE: 0
         X-RINCON-VARIANT: 0
         */
        var poss = usedPorts.indexOf(port);
        if (poss !== -1) usedPorts.splice(poss, 1);

        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (socket) {
            socket.close();
            socket = null;
        }
        msg = msg ? msg.toString() : '';
        if (typeof callback === 'function') {
            msg = msg.replace(/\r\n/g, '\n');
            var lines = msg.split('\n');
            var result = {};
            for (var i = 0; i < lines.length; i++) {
                var pos = lines[i].indexOf(':');
                if (pos !== -1) {
                    result[lines[i].substring(0, pos)] = lines[i].substring(pos + 1).trim();
                } else {
                    result[lines[i]] = '';
                }
            }
            if (readXml) {
                if (result.LOCATION) {
                    httpGet(result.LOCATION, timeout, function (err, data) {
                        callback && callback(err, result, ip, data);
                        callback = null;
                    });
                } else {
                    callback && callback(null, result, ip);
                    callback = null;
                }
            } else {
                callback && callback(null, result, ip);
                callback = null;
            }
        }
    });

    socket.bind(port);
    var msg;

    if (parseInt(process.version.substring(1), 10) < 6) {
        msg = new Buffer(text);
    } else {
        msg = Buffer.from(text);
    }

    socket.send(msg, 0, msg.length, 1900, ip);

    timer = setTimeout(function () {
        var poss = usedPorts.indexOf(port);
        if (poss !== -1) usedPorts.splice(poss, 1);

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

function udpScan(probeAddress, probePort, listenAddress, listenPort, probeData, timeout, callback) {
    if (! Buffer.isBuffer(probeData)) {
        probeData = new Buffer(probeData);
    }

    var udpSocket = udp.createSocket({type:"udp4", reuseAddr:true});

    var probeTimeout = setTimeout(function() {
        udpSocket.close();
        console.log('Not found');
        if (callback) callback(null, null);
        callback = null;
    }, timeout);

    udpSocket.on('error', function (err) {
        clearTimeout(probeTimeout);
        try {
            udpSocket.close();
        }
        catch (e) {
        }
        console.log('ERROR udpSocket: ' + err);
        if (callback) callback(err, null);
        callback = null;
    });

    udpSocket.bind(listenPort, listenAddress, function() {
        try {
            udpSocket.addMembership('224.0.0.1');
            udpSocket.setBroadcast(true);
        }
        catch (e) {
            udpSocket.emit('error', e);
        }
    });

    udpSocket.on("message", function (message, remote) {
        clearTimeout(probeTimeout);
        console.log('Discovery finished:' + remote.address + ':' + remote.port +' - ' + message);
        udpSocket.close();
        if (callback) callback(null, message.toString());
        callback = null;
    });

    udpSocket.on('listening', function() {
        console.log('Send UDP discovery package');
        try {
            udpSocket.send(probeData, 0, probeData.length, probePort, probeAddress);
        }
        catch (e) {
        }
    });
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

/**
 * Tries to read HTML page.
 *
 * @alias httpGet
 * @memberof tools
 * @param {string} link http link, like http://192.168.1.2:80/abc/de.xml
 * @param {number} timeout timeout in ms (default 500)
 * @param {function} callback return result
 *        <pre><code>function (error, resultAsString, link) {}</code></pre>
 */
function httpGet(link, timeout, callback) {
    http = http || require('http');

    if (typeof timeout === 'function') {
        callback = timeout;
        timeout = 500;
    }
    timeout = parseInt(timeout, 10) || 500;

    var req = http.get(link, function (res) {
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
            callback && callback(null, rawData ? rawData.toString() : null, link);
        });
    }).on('error', function (e) {
        callback && callback(e.message, null, link);
    });

    req.setTimeout(timeout, function () {
        this.abort();
        callback && callback('timeout', null, link);
        callback = null;
    });
}

var serialDebug = false;
/**
 * Test USB/Serial port if some device is there.
 *
 * @alias testSerialPort
 * @memberof tools
 * @param {string} name name of COM port
 * @param {object} options options for serial port like {timeout: 2000}
 * @param {object} baudRates array or number with baudrate like [9600, 1200] or 57600
 * @param {function} onOpen called if port was opened.
 *     <pre><code>
 *           function onOpen(port, callback) {
 *                try {
 *                    port.write('10;VERSION;');
 *                    port.drain();
 *                } catch (e) {
 *                    options.log.warn('Cannot write to port: ' + e);
 *                    return callback(e);
 *                }
 *                callback();
 *           }
 *     </code></pre>
 * @param {function} onReceived called if port was opened.
 *     <pre><code>
 *           function onAnswer(port, data, callback) {
 *               // expected 20;99;"RFLink Gateway software version";
 *               var text = data ? data.toString() : '';
 *               callback(null, data.indexOf('RFLink') !== -1, true, data.substring(20)); // return here version of FW
 *           }
 *     </code></pre>
 *  @param {function} callback return result
 *        <pre><code>function (error, isFound, portName, foundBaudrate, receivedText) {}</code></pre>
 */
function testSerialPort(name, options, baudRates, onOpen, onReceived, callback) {
    if (typeof baudRates === 'object') {
        if (!baudRates || !baudRates.length) {
            if (serialDebug) options.log.error('------------------- <<< <<< <<< <0< testSerialPort "' + name);
            if (serialDebug) options.log.warn('Stop scan port ' + name);
            callback('not found', false, name);
        } else {
            var baudRate = baudRates.shift();
            if (serialDebug) options.log.warn('Call port ' + name + ' ' + baudRate);
            if (serialDebug && !options.__done) {
                options.__done = true;
                options.log.error('------------------- >>> >>> >>> >>> testSerialPort "' + name);
            }
            testSerialPort(name, options, baudRate, onOpen, onReceived, function (err, found, name, baudrate, someInfo) {
                if (found) {
                    if (serialDebug) options.log.error('------------------- <<< <<< <<< <1< testSerialPort "' + name);
                    callback(null, true, name, baudrate, someInfo);
                } else {
                    setTimeout(testSerialPort, 0, name, options, baudRates, onOpen, onReceived, callback);
                }
            });
        }
    } else {
        if (serialDebug) options.log.error('------------------- >>> >>> >>> >>> >>> testSerialPort "' + name + ' - ' + baudRates);
        var isOpened;
        var timeout;
        var closing = false;
        try {
            if (serialDebug) options.log.warn('Open port ' + name);
            SerialPort = SerialPort || require('serialport');

            options = options || {};
            options.autoOpen = false;
            options.baudRate = parseInt(baudRates, 10);
            options.timeout  = options.timeout || 1000;

            var port = new SerialPort(name, options);

            function closePort(code, found) {
                if (closing) return;
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                try {
                    if (port && port.isOpen()) {
                        if (serialDebug) options.log.debug(new Date() + ' close port ' + name + ' ' + baudRates);
                        closing = true;
                        port.close(function () {
                            if (callback) {
                                if (serialDebug) options.log.error('------------------- <<< <<< <<< <<< <' + code + '< testSerialPort "' + name + ' - ' + baudRates);
                                callback('timeout', found || false, name, baudRate);
                                callback = null;
                            }
                        });
                        port = null;
                        return;
                    }
                } catch (e) {
                    if (serialDebug) options.log.warn('Cannot close port ' + name + ': ' + e)
                }
                port = null;
                if (callback) {
                    if (serialDebug) options.log.error('------------------- <<< <<< <<< <<< 1' + code + '< testSerialPort "' + name + ' - ' + baudRates);
                    callback(null, found || false, name, baudRate);
                    callback = null;
                }
            }

            // the open event will always be emitted
            port.on('open', function() {
                isOpened = true;
                if (serialDebug) options.log.warn('port ' + name + ' opened: ' + options.baudRate);

                if (onOpen) {
                    onOpen(port, function (err) {
                        if (err) {
                            // immediately close
                            closePort(1);
                        } else {
                            // wait for answer
                            timeout = setTimeout(closePort, options.timeout, 1, false);
                        }
                    });
                } else {
                    closePort(2, true);
                }
            });

            port.on('data', function (data) {
                if (onReceived) {
                    try {
                        onReceived(port, data, function (err, found, isStop, someInfo) {
                            if (err || isStop || found) {
                                closePort(3, found);
                            }
                        });
                    }catch (e) {
                        if (serialDebug) options.log.warn('Cannot onReceive port ' + name + ': ' + e);
                        closePort(4);
                    }
                } else {
                    closePort(5, true);
                }
            });

            port.on('error', function (err) {
                if (err) {
                    if (serialDebug) options.log.error('Error on port ' + name + ': ' + err);
                    closePort(6);
                }
            });

            port.open(function (err) {
                if (err) {
                    if (serialDebug) options.log.warn('Cannot open port, ' + name + ': ' + err);
                    closePort(7);
                }
            });
        } catch (err) {
            if (serialDebug) options.log.error('Cannot open_ port ' + name + ': ' + err);
            closePort(8);
        }
    }
}

/**
 * Tries to read location description and remember it in the device Object.
 *
 * @memberof tools
 * @param {device} device parameter of the detect function
 * @param {url} optional,
 * @param {function} callback return result
 *        <pre><code>function (error, resultAsString, link) {}</code></pre>
 */

function getLocationDesc(device, locationUrl, callback) {
    if (typeof locationUrl === 'function') {
        callback = locationUrl;
        locationUrl = undefined;
    }
    if (device._locationDesc) return callback (0, device._locationDesc);
    if (!locationUrl && device._upnp && device._upnp.LOCATION) locationUrl = device._upnp.LOCATION;


    if (!location) return callback && callback ('no location url');
    httpGet (locationUrl, 2000, function (err, data) {
        if (!err && data) device.w_locationDesc = data;
        callback && callback (err, data);
    });
}


var words = require(__dirname + '/../admin/words.js');

exports.getLocationDesc   = getLocationDesc;
exports.getOwnAddress     = getOwnAddress;
exports.testPort          = testPort;
exports.testSerialPort    = testSerialPort;
exports.getNextInstanceID = getNextInstanceID;
exports.findInstance      = findInstance;
exports.checkEnumName     = checkEnumName;
exports.httpGet           = httpGet;
exports.ssdpScan          = ssdpScan;
exports.udpScan           = udpScan;
exports.translate         = require(__dirname + '/../admin/words.js').translate;
exports.words             = require(__dirname + '/../admin/words.js').words;
