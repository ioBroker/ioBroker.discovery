var tools = require(__dirname + '/../tools.js');

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

    // try to test TCP ports 2000, 2001, 2002
    var count = 0;
    // test hs485d
    count++;
    var someFound = false;
    var name = ip + (device._name ? (' - ' + device._name) : '');

    tools.testPort(ip, 2000, {
        onConnect: function (ip, port, client) {
            client.write(
                'POST / HTTP/1.1\r\n' +
                'User-Agent: NodeJS XML-RPC Client\r\n' +
                'Content-Type: text/xml\r\n' +
                'Accept: text/xml\r\n' +
                'Accept-Charset: UTF8\r\n' +
                'Connection: Keep-Alive\r\n' +
                'Content-Length: 98\r\n' +
                'Host: ' + ip + ':' + port + '\r\n' +
                '\r\n' +
                '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
        },
        onReceive: function (data, ip, port, client) {
            return data && !!data.toString().match(/<value>[.\d]+<\/value>/);
        }
    }, function (err, found, ip, port) {
        if (found) {
            var instance = tools.findInstance(options, 'hm-rpc', function (obj) {
                return obj.native.homematicAddress === ip && obj.native.homematicPort === 2000;
            });
            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc',
                        title: 'HomeMatic hs485d (' + name + ')'
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
                        add: ['hs485d (' + name + ')']
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });

    // test rfd
    tools.testPort(ip, 2001,  {
            onConnect: function (ip, port, client) {
                client.write(
                    'POST / HTTP/1.1\r\n' +
                    'User-Agent: NodeJS XML-RPC Client\r\n' +
                    'Content-Type: text/xml\r\n' +
                    'Accept: text/xml\r\n' +
                    'Accept-Charset: UTF8\r\n' +
                    'Connection: Keep-Alive\r\n' +
                    'Content-Length: 98\r\n' +
                    'Host: ' + ip + ':' + port + '\r\n' +
                    '\r\n' +
                    '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
            },
            onReceive: function (data, ip, port, client) {
                return data && !!data.toString().match(/<value>[.\d]+<\/value>/);
            }
        },
        function (err, found, ip, port) {
            if (found) {
                var instance = tools.findInstance(options, 'hm-rpc', function (obj) {
                    return obj.native.homematicAddress === ip && obj.native.homematicPort === 2001;
                });
                if (instance) found = false;

                if (found) {
                    options.newInstances.push({
                        _id: tools.getNextInstanceID('hm-rpc', options),
                        common: {
                            name: 'hm-rpc',
                            title: 'HomeMatic Wireless (' + name + ')'
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
                            add: ['Wireless RF (' + name + ')']
                        }
                    });
                    someFound = true;
                }
            }
            if (!--count) callback(null, someFound, ip);
        });
    
    // test CUxD
    tools.testPort(ip, 8701, function (err, found, ip, port) {
        if (found) {
            var instance = tools.findInstance(options, 'hm-rpc', function (obj) {
                return obj.native.homematicAddress === ip && obj.native.homematicPort === 8701;
            });
            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc',
                        title: 'HomeMatic CuxD (' + name + ')'
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
                        add: ['CUxD (' + name + ')']
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });
    
    // HMIP
    tools.testPort(ip, 2010, {
        onConnect: function (ip, port, client) {
            client.write(
                'POST / HTTP/1.1\r\n' +
                'User-Agent: NodeJS XML-RPC Client\r\n' +
                'Content-Type: text/xml\r\n' +
                'Accept: text/xml\r\n' +
                'Accept-Charset: UTF8\r\n' +
                'Connection: Keep-Alive\r\n' +
                'Content-Length: 98\r\n' +
                'Host: ' + ip + ':' + port + '\r\n' +
                '\r\n' +
                '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
        },
        onReceive: function (data, ip, port, client) {
            return data && !!data.toString().match(/<value>[.\d]+<\/value>/);
        }
    }, function (err, found, ip, port) {
        if (found) {
            var instance = tools.findInstance(options, 'hm-rpc', function (obj) {
                return obj.native.homematicAddress === ip && obj.native.homematicPort === 2010;
            });
            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('hm-rpc', options),
                    common: {
                        name: 'hm-rpc',
                        title: 'HomeMatic HMIP (' + name + ')'
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
                        add: ['HMIP (' + name + ')']
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
