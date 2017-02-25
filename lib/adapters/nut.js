var tools = require(__dirname + '/../tools.js');

var foundNutServer = {};
var waiting = false;

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger

    tools.testPort(ip, 3493, {
        onConnect: function (ip, port, client) {
            options.log.debug('Got connection to NUT on ' + ip + ':' + port);
            client.write('LIST UPS\n');
        },
        onReceive: function (data, ip, port, client) {
            if (!data) return false;
            if (Buffer.isBuffer(data)) data = data.toString();
            if (typeof data !== 'string') return false;
            options.log.debug('Got response from NUT on ' + ip + ':' + port + ' = ' + JSON.stringify(data));
            if (!waiting && (data.indexOf('BEGIN') === 0)) {
                waiting = true;
            }

            var vars = {};
            var data_array = data.split('\n');
    		var re = /^UPS\s+(.+)\s+"(.+)"/;
    		for (i = 0; i < data_array.length-1; i++) {
    			var line = data_array[i];
                if (line.indexOf('UPS ') === 0) {
    				matches = re.exec(line);
    				vars[matches[1]] = matches[2];
                    options.log.debug('Detected UPS ' + matches[1] + '@' + ip + ': ' + matches[2]);
    			}
                else if (line.indexOf('END ') === 0) {
                    waiting = false;
                }
            }
            if (Object.keys(vars).length) {
                foundNutServer[ip] = vars;
                if (waiting) return null;
                return true;
            }
            if (waiting) return null;
            return false;
        }
    }, function (err, found, ip, port) {
        waiting = false;
        if (found) {
            var foundNew = false;
            for (var foundUps in foundNutServer[ip]) {
                if (!foundNutServer[ip].hasOwnProperty(foundUps)) continue;
                
                var instance = tools.findInstance(options, 'nut', function (obj) {
                    //TODO handling 127.0.0.1 vs other IP
                    var matchFound = (obj.native.host_ip === ip && obj.native.host_port === 3493 && obj.native.ups_name === foundUps);
                    options.log.debug('Check existing NUT instances for UPS ' + foundUps + '@' + ip + ':' + matchFound);
                    return matchFound;
                });
                if (!instance) {
                    foundNew = true;
                    var name = foundUps + '@' + ip + ' (' + foundNutServer[ip][foundUps] + ')';
                    instance = {
                        _id: tools.getNextInstanceID('nut', options),
                        common: {
                            name: 'nut',
                            title: 'Network UPS Adapter (' + name + ')'
                        },
                        native: {
                            host_ip: ip,
                            host_port: 3493,
                            ups_name: foundUps
                        },
                        comment: {
                            add: [name]
                        }
                    };
                    options.newInstances.push(instance);
                    options.log.debug('Add new NUT Instance');
                }
            }
            callback(null, foundNew, ip);
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks
exports.dependencies = ['nut'];
