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

    // try to test TCP ports 8123
    var someFound = false;
    var name = ip + ((device._name && device._name !== ip) ? (' - ' + device._name) : '');

    tools.testPort(ip, 7072, 500, {
        onConnect: function (ip, port, client) {
            client.write('\n\n\njsonlist2\n'); // assume there is no password
        },
        onReceive: function (data, ip, port, client) {
            return data && !!data.toString().match(/^{/);
        }
    }, function (err, found, ip, port) {
        if (found) {
            var instance = tools.findInstance(options, 'fhem', function (obj) {
                return (obj.native.host === ip || obj.native.host === device._name);
            });
            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('fhem', options),
                    common: {
                        name: 'fhem',
                        title: 'FHEM (' + name + ')'
                    },
                    native: {
                        host: ip,
                        port: 7072
                    },
                    comment: {
                        add: ['FHEM (' + name + ')']
                    }
                });
                someFound = true;
            }
        }
        if (callback) {
            callback(null, found, ip);
            callback = null;
        }
    });
}

exports.detect  = detect;
exports.type    = 'ip';// make type=serial for USB sticks
exports.timeout = 500;