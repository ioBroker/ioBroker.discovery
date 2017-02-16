var tools = require(__dirname + '/../tools.js');

// just check if IP exists
function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // options.device - additional info about device
    
    var instance;
    var fromOldInstances = false;
    for (var j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common && options.newInstances[j].common.name === 'ping') {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (var i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common && options.existingInstances[i].common.name === 'ping') {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                break;
            }
        }
        fromOldInstances = true;
    }
    
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('ping', options),
            common: {
                name: 'ping'
            },
            native: {
                devices: []
            },
            comment: {
                add: true
            }
        };
        options.newInstances.push(instance);
    }

    var isNew = false;
    if (instance.native.devices.indexOf(ip) === -1) {
        instance.native.devices.push(ip);
        isNew = true;
        if (fromOldInstances) {
            options.newInstances.push(instance);
            instance.comment = instance.comment || {};
            if (!instance.comment.add) {
                instance.comment.extended = instance.comment.extended || [];
                instance.comment.extended.push(ip);
            }
        }
    }

    callback(null, isNew, ip);
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks