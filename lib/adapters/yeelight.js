var tools = require(__dirname + '/../tools.js');
const dgram = require('dgram');
const usedPorts = [];

function detect(ip, device, options, callback) {

    ownip = tools.getOwnAddress(ip);
    var instance = tools.findInstance(options, 'yeelight-2');

    ssdpScanMOD(ip, 'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: ' + ownip + ':19140\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'ST: wifi_bulb\r\n', true, 3000,
        function (err, data) {
            var name = ip + '(' + data.model + ')';

            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('yeelight-2', options),
                    common: {
                        name: 'yeelight-2',
                        enabled: true,
                        title: 'yeelight-2 (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
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
            instance.native.devices.push({
                name: data.id,
                ip: ip,
                port: "55443",
                smart_name: '',
                type: data.model
            });

            instance.comment.add.push(name);

            callback(null, true, ip);

        });

}
//changed port from 1900 to 1982
function ssdpScanMOD(ip, text, readXml, timeout, callback) {
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

    let socket = dgram.createSocket('udp4');
    let timer;
    let port = 19148;
    while (usedPorts.indexOf(port) !== -1) port++;
    usedPorts.push(port);
    const result = [];

    // Send to port 1982 UDP request
    socket.on('error', function (err) {
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
    socket.on('message', function (msg, rinfo) {
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
    let msg;

    if (parseInt(process.version.substring(1), 10) < 6) {
        msg = new Buffer(text);
    } else {
        msg = Buffer.from(text);
    }

    socket.send(msg, 0, msg.length, 1982, ip);

    timer = setTimeout(function () {
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

exports.detect = detect;
exports.type = ['ip'];