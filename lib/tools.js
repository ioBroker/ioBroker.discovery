/* global Uint8Array */

'use strict';

const Netmask = require('netmask').Netmask;
const os = require('os');
const udp = require('dgram');
const http = require('http');
const https = require('https');

let interfaces;
let net;
let dgram;
let SerialPort;

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

    for (const k in interfaces) {

        if (!interfaces.hasOwnProperty(k)) continue;

        for (const k2 in interfaces[k]) {
            if (!interfaces[k].hasOwnProperty(k2)) continue;
            const address = interfaces[k][k2];

            if (address.family === 'IPv4') {
                const block1 = new Netmask(address.address + '/' + address.netmask);
                const block2 = new Netmask(ip + '/' + address.netmask);
                if (block1.base === block2.base) {
                    return address.address;
                }
            }
        }
    }
    return '0.0.0.0';
}

/**
 * Gets an array of all valid IPv4 broadcast addresses this host can send to
 * @returns {string[]}
 */
function getBroadcastAddresses() {
    // enumerate interfaces
    const net = os.networkInterfaces();
    const broadcastAddresses = Object.keys(net)
        // flatten the array structure
        .map(k => net[k])
        .reduce((prev, cur) => prev.concat(cur), [])
        // only use external IPv4 ones
        .filter(add => !add.internal && add.family === 'IPv4')
        // extract address and subnet as number array
        .map(k => ({
            address: k.address.split('.').map(num => +num),
            netmask: k.netmask.split('.').map(num => +num)
        }))
        // broadcast is address OR (not netmask)
        .map(add => {
            return add.address.map((val, i) => (val | ~add.netmask[i]) & 0xff);
        })
        // ignore unconnected ones
        .filter(add => add[0] !== 169)
        // turn the address into a string again
        .map(a => `${a[0]}.${a[1]}.${a[2]}.${a[3]}`)
        ;
    return broadcastAddresses;
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
    let client = new net.Socket();
    let timer;
    if (typeof timeout === 'object') {
        callback = options;
        options = timeout;
        timeout = 0;
    }
    if (typeof timeout === 'function') {
        callback = timeout;
        timeout = 500;
    }
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    options = options || {};
    timeout = timeout || 500;

    client.on('data', data => {
        let noDestroy = false;
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

    client.on('error', () => {
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

    timer = setTimeout(() => {
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

    client.connect(port, ip, () => {
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

const usedPorts = [];
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
 * @param {string} text filter string like "urn:dial-multiscreen-org:service:dial:1"
 * @param {boolean} readXml if LOCATION xml should be read
 * @param {number} timeout timeout in ms (default 1000)
 * @param {number} probePort send to port (default 1900)
 * @param {function} callback return result
 *        <pre><code>function (error, result, ip, xmlData) {}</code></pre>
 */
function ssdpScan(ip, text, readXml, timeout, probePort, callback) {
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
    if (typeof probePort === 'function') {
        callback = probePort;
        probePort = 1900;
    }
    timeout = timeout || 1000;
    probePort    = probePort || 1900;

    dgram = dgram || require('dgram');
    let socket = dgram.createSocket('udp4');
    let timer;
    let port = 19140;
    while (usedPorts.indexOf(port) !== -1) port++;
    usedPorts.push(port);
    const result = [];
    // Send to port 1900 UDP request
    socket.on('error', err => {
        const pos = usedPorts.indexOf(port);
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
    socket.on('message', (msg, rinfo) => {
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
        const poss = usedPorts.indexOf(port);
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
            const lines = msg.split('\n');
            const result = {};
            for (let i = 0; i < lines.length; i++) {
                const pos = lines[i].indexOf(':');
                if (pos !== -1) {
                    result[lines[i].substring(0, pos)] = lines[i].substring(pos + 1).trim();
                } else {
                    result[lines[i]] = '';
                }
            }
            if (readXml) {
                if (result.LOCATION) {
                    httpGet(result.LOCATION, timeout, (err, data) => {
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
    let msg;

    msg = Buffer.from(text);

    socket.send(msg, 0, msg.length, probePort, ip);

    timer = setTimeout(() => {
        const poss = usedPorts.indexOf(port);
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
    if (!Buffer.isBuffer(probeData)) {
        probeData = Buffer.from(probeData);
    }

    const udpSocket = udp.createSocket({type: 'udp4', reuseAddr: true});

    const probeTimeout = setTimeout(() => {
        udpSocket.close();
        callback && callback(null, null);
        callback = null;
    }, timeout);

    udpSocket.on('error', err => {
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

    udpSocket.bind(listenPort, listenAddress, () => {
        try {
            udpSocket.addMembership('224.0.0.1');
            udpSocket.setBroadcast(true);
        }
        catch (e) {
            udpSocket.emit('error', e);
        }
    });

    udpSocket.on('message', (message, remote) => {
        clearTimeout(probeTimeout);
        console.log('Discovery finished:' + remote.address + ':' + remote.port + ' - ' + message);
        udpSocket.close();
        callback && callback(null, message.toString(), remote);
        callback = null;
    });

    udpSocket.on('listening', () => {
        try {
            udpSocket.send(probeData, 0, probeData.length, probePort, probeAddress);
        } catch (e) {
        }
    });
}

function checkEnumName(enums, name) {
    if (!enums || typeof enums !== 'object') {
        return false;
    }
    return Object.keys(enums).find(enumId => {
        if (enums[enumId].common.name === name || (name && enums[enumId].name === name)) {
            return true;
        }
        if (enums[enumId].common.name && typeof enums[enumId].common.name === 'object') {
            return Object.keys(enums[enumId].common.name).find(lang => enums[enumId].common.name[lang] === name);
        }
        if (enums[enumId].name && typeof enums[enumId].name === 'object') {
            return Object.keys(enums[enumId].name).find(lang => enums[enumId].name[lang] === name);
        }
    });
}

function getNextInstanceID(name, options) {
    const instances = [];
    if (options && options.newInstances) {
        for (let j = 0; j < options.newInstances.length; j++) {
            if (options.newInstances[j].common && options.newInstances[j].common.name === name) {
                instances.push(parseInt(options.newInstances[j]._id.substring(('system.adapter.' + name + '.').length), 10));
            }
        }
    }
    if (options && options.existingInstances) {
        for (let k = 0; k < options.existingInstances.length; k++) {
            if (options.existingInstances[k].common && options.existingInstances[k].common.name === name) {
                instances.push(parseInt(options.existingInstances[k]._id.substring(('system.adapter.' + name + '.').length), 10));
            }
        }
    }

    let instance = 0;
    while (instances.includes(instance)) {
        instance++;
    }
    return 'system.adapter.' + name + '.' + instance;
}

function findInstance(options, name, compare) {
    for (let i = 0; i < options.existingInstances.length; i++) {
        if (options.existingInstances[i].common && options.existingInstances[i].common.name === name &&
            (!compare || compare(options.existingInstances[i]))) {
            const instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
            instance._existing = true;
            return instance;
        }
    }

    for (let i = 0; i < options.newInstances.length; i++) {
        if (options.newInstances[i].common && options.newInstances[i].common.name === name &&
            (!compare || compare(options.newInstances[i]))) {
            const instance = JSON.parse(JSON.stringify(options.newInstances[i]));
            return instance;
        }
    }
    return null;
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
    const HTTP = link && link.startsWith('https') ? https : http;

    if (typeof timeout === 'function') {
        callback = timeout;
        timeout = 500;
    }
    if (!callback) {
        return new Promise((resolve, reject) => {
            httpGet(link, timeout, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }
    timeout = parseInt(timeout, 10) || 500;

    if (!link) {
        callback && callback('error: no link provided', null, link);
        callback = null;
    }

    try {
        const req = HTTP.get(link, res => {
            const statusCode = res.statusCode;

            if (statusCode !== 200) {
                // consume response data to free up memory
                res.resume();
                callback(statusCode, null, link);
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => callback && callback(null, rawData ? rawData.toString() : null, link));
        }).on('error', e => callback && callback(e.message, null, link));

        req.setTimeout(timeout, () => {
            req.abort();
            callback && callback('timeout', null, link);
            callback = null;
        });
    } catch (err) {
        callback && callback('error: ' + err, null, link);
        callback = null;
    }
}

const serialDebug = false;
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
 *               const text = data ? data.toString() : '';
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
            const baudRate = baudRates.shift();
            if (serialDebug) options.log.warn('Call port ' + name + ' ' + baudRate);
            if (serialDebug && !options.__done) {
                options.__done = true;
                options.log.error('------------------- >>> >>> >>> >>> testSerialPort "' + name);
            }
            testSerialPort(name, options, baudRate, onOpen, onReceived, (err, found, name, baudrate, someInfo) => {
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
        let isOpened;
        let timeout;
        let closing = false;
        let closePort;
        try {
            if (serialDebug) options.log.warn('Open port ' + name);
            SerialPort = SerialPort || require('serialport');

            options = options || {};
            options.autoOpen = false;
            options.baudRate = parseInt(baudRates, 10);
            options.timeout = options.timeout || 1000;

            let port = new SerialPort(name, options);

            closePort = (code, found) => {
                if (closing) return;
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                try {
                    if (port && port.isOpen) {
                        if (serialDebug) options.log.debug(new Date() + ' close port ' + name + ' ' + baudRates);
                        closing = true;
                        port.close(() => {
                            if (callback) {
                                if (serialDebug) options.log.error('------------------- <<< <<< <<< <<< <' + code + '< testSerialPort "' + name + ' - ' + baudRates);
                                callback('timeout', found || false, name, baudRates);
                                callback = null;
                            }
                        });
                        port = null;
                        return;
                    }
                } catch (e) {
                    if (serialDebug) options.log.warn('Cannot close port ' + name + ': ' + e);
                }
                port = null;
                if (callback) {
                    if (serialDebug) options.log.error('------------------- <<< <<< <<< <<< 1' + code + '< testSerialPort "' + name + ' - ' + baudRates);
                    callback(null, found || false, name, baudRates);
                    callback = null;
                }
            };

            // the open event will always be emitted
            port.on('open', () => {
                isOpened = true;
                if (serialDebug) options.log.warn('port ' + name + ' opened: ' + options.baudRate);

                if (onOpen) {
                    onOpen(port, err => {
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

            port.on('data', data => {
                if (onReceived) {
                    try {
                        onReceived(port, data, (err, found, isStop, someInfo) => {
                            if (err || isStop || found) {
                                closePort(3, found);
                            }
                        });
                    } catch (e) {
                        if (serialDebug) options.log.warn('Cannot onReceive port ' + name + ': ' + e);
                        closePort(4);
                    }
                } else {
                    closePort(5, true);
                }
            });

            port.on('error', err => {
                if (err) {
                    if (serialDebug) options.log.error('Error on port ' + name + ': ' + err);
                    closePort(6);
                }
            });

            port.open(err => {
                if (err) {
                    if (serialDebug) options.log.warn('Cannot open port, ' + name + ': ' + err);
                    closePort(7);
                }
            });
        } catch (err) {
            if (serialDebug) options.log.error('Cannot open_ port ' + name + ': ' + err);
            closePort && closePort(8);
        }
    }
}

/**
 * Tries to read location description and remember it in the device Object.
 *
 * @memberof tools
 * @param {object} device parameter of the detect function
 * @param {url} locationUrl optional,
 * @param {function} callback return result
 *        <pre><code>function (error, resultAsString, link) {}</code></pre>
 */

function getLocationDesc(device, locationUrl, callback) {
    if (typeof locationUrl === 'function') {
        callback = locationUrl;
        locationUrl = undefined;
    }
    if (device._locationDesc) {
        return callback(0, device._locationDesc);
    }
    if (!locationUrl && device._upnp && device._upnp.LOCATION) {
        locationUrl = device._upnp.LOCATION;
    }


    if (!location) return callback && callback('no location url');
    httpGet(locationUrl, 2000, (err, data) => {
        if (!err && data) {
            device.w_locationDesc = data;
        }
        callback && callback(err, data);
    });
}

/**
 * Tests if str starts with search
 * @param {string} str
 * @param {string} search
 */
function startsWith(str, search) {
    return str.substring(0, search.length) === search;
}

module.exports = {
    getBroadcastAddresses,
    getLocationDesc,
    getOwnAddress,
    testPort,
    testSerialPort,
    getNextInstanceID,
    findInstance,
    checkEnumName,
    httpGet,
    ssdpScan,
    udpScan,
    startsWith,
    translate: require('../admin/words.js').translate,
    words: require('../admin/words.js').words
};
