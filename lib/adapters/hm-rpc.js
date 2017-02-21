var net;
var tools = require(__dirname + '/../tools.js');

function testPort(ip, port, callback) {
    net = net || require('net');
    var client = new net.Socket();

    client.connect(port, ip, function() {
        if (callback) {
            callback(null, ip, port, true);
            callback = null;
        }
        if (client) {
            client.destroy();
            client = null;
        }
        // send getVersion request via XML RPC
        /*var xml       = Serializer.serializeMethodCall('getVersion', params)
            , transport = http
            , options   = this.options

        options.headers['Content-Length'] = Buffer.byteLength(xml, 'utf8')
        this.headersProcessors.composeRequest(options.headers)
        var request = transport.request(options, function(response) {
            if (response.statusCode == 404) {
                callback(new Error('Not Found'));
            }
            else {
                this.headersProcessors.parseResponse(response.headers)
                var deserializer = new Deserializer(options.responseEncoding)
                deserializer.deserializeMethodResponse(response, callback)
            }
        }.bind(this))

        request.on('error', callback)
        request.write(xml, 'utf8')
        request.end()*/
    });

    client.on('data', function(data) {
        client.destroy(); // kill client after server's response
    });

    client.on('error', function() {
        if (callback) {
            callback(null, ip, port, false);
            callback = null;
        }
        if (client) {
            client.destroy();
            client = null;
        }
    });
}

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    
    // try to test TCP ports 2000, 2001, 2002
    var count = 0;
    // test hs485d
    count++;
    var someFound = false;
    testPort(ip, 2000, function (err, ip, port, found) {
        if (found) {
            for (var i = 0; i < options.existingInstances.length; i++) {
                if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'hm-rega' &&
                    options.existingInstances[i].native.homematicAddress === ip && options.existingInstances[i].native.homematicPort === 2000
                ) {
                    found = false;
                    break;
                }
            }
            
            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc'
                    },
                    native: {
                        homematicAddress: ip,
                        adapterAddress: tools.getOwnAddress(ip),
                        homematicPort: 2000,
                        port: 12000,
                        type: 'bin',
                        daemon: 'hs485d'
                    },
                    comment: {
                        add: true,
                        text: 'hs485d'
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });

    // test rfd
    testPort(ip, 2001, function (err, ip, port, found) {
        if (found) {
            for (var i = 0; i < options.existingInstances.length; i++) {
                if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'hm-rega' &&
                    options.existingInstances[i].native.homematicAddress === ip && options.existingInstances[i].native.homematicPort === 2001
                ) {
                    found = false;
                    break;
                }
            }

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc'
                    },
                    native: {
                        homematicAddress: ip,
                        adapterAddress: tools.getOwnAddress(ip),
                        homematicPort: 2001,
                        port: 12001,
                        type: 'bin',
                        daemon: 'rfd'
                    },
                    comment: {
                        add: true,
                        text: 'Wireless RF'
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });
    
    // test CUxD
    testPort(ip, 8701, function (err, ip, port, found) {
        if (found) {
            for (var i = 0; i < options.existingInstances.length; i++) {
                if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'hm-rega' &&
                    options.existingInstances[i].native.homematicAddress === ip && options.existingInstances[i].native.homematicPort === 8701
                ) {
                    found = false;
                    break;
                }
            }

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc'
                    },
                    native: {
                        homematicAddress: ip,
                        adapterAddress: tools.getOwnAddress(ip),
                        homematicPort: 8701,
                        port: 18701,
                        type: 'bin',
                        daemon: 'CUxD'
                    },
                    comment: {
                        add: true,
                        text: 'CUxD'
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });
    
    // HMIP
    testPort(ip, 2010, function (err, ip, port, found) {
        if (found) {
            for (var i = 0; i < options.existingInstances.length; i++) {
                if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'hm-rega' &&
                    options.existingInstances[i].native.homematicAddress === ip && options.existingInstances[i].native.homematicPort === 2010
                ) {
                    found = false;
                    break;
                }
            }

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc'
                    },
                    native: {
                        homematicAddress: ip,
                        adapterAddress: tools.getOwnAddress(ip),
                        homematicPort: 2010,
                        port: 12010,
                        type: 'xml',
                        daemon: 'HMIP'
                    },
                    comment: {
                        add: true,
                        text: 'HMIP'
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks
