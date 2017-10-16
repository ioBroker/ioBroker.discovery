var tools = require(__dirname + '/../tools.js');
// based on miele
var adapterName = 'homepilot';
var reIsHomepilot = /<h1 id="form-container-automation-conflict-detection-title-resolve">/;

function detect(ip, device, options, callback) {
    if (device._source !== 'ip') return callback(null, false, ip);
    
    tools.httpGet('http://' + ip + '/actor.do', function (err, data) {
        var ar;
        if (!err && data && reIsHomepilot.test(data)) {
            var instance = tools.findInstance (options, adapterName, function (obj) {
                return true;
            });
            if (!instance) {
                var name = device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID (adapterName, options),
                    common: {
                        name: adapterName,
                        title: 'Homepilot (' + ip + (name ? (' - ' + name) : '') + ')'
                    },
                    native: {
                        ip: ip
                    },
                    comment: {
                        add: [name, ip]
                    }
                };
                options.newInstances.push (instance);
                return callback (null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
