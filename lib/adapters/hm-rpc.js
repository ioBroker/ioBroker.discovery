var net;
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

function detect(ip, options, callback) {
    var result = null;
    // try to test TCP ports 2000, 2001, 2002
    var count = 0;
    // test hs485d
    count++;
    testPort(ip, 2000, function (err, ip, port, found) {
        if (found) {
            result = result || {};
            result.hs485d = true;
        }
        if (!--count) callback(null, result, ip);
    });

    // test rfd
    testPort(ip, 2001, function (err, ip, port, found) {
        if (found) {
            result = result || {};
            result.rfd = true;
        }
        if (!--count) callback(null, result, ip);
    });
    // test CUxD
    testPort(ip, 8701, function (err, ip, port, found) {
        if (found) {
            result = result || {};
            result.CUxD = true;
        }
        if (!--count) callback(null, result, ip);
    });
    // HMIP
    testPort(ip, 2010, function (err, ip, port, found) {
        if (found) {
            result = result || {};
            result.HMIP = true;
        }
        if (!--count) callback(null, result, ip);
    });
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks