var tools = require(__dirname + '/../tools.js');

function addDaikin(ip, device, data, options, callback) {
    var foundNew = false;
    var instance = tools.findInstance(options, 'daikin', function (obj) {
        var matchFound = (obj.native.daikinIp === ip || obj.native.daikinIp === device._name);
        options.log.debug('Check existing Daikin instances for Device ' + ip + '/ ' + device._name + ':' + matchFound);
        return matchFound;
    });

    if (!instance) {
        foundNew = true;
        instance = {
            _id: tools.getNextInstanceID('daikin', options),
            common: {
                name: 'daikin',
                title: 'Daikin climate control (' + decodeURIComponent(data.name) + ')'
            },
            native: {
                daikinIp: ip
            },
            comment: {
                add: ['Daikin climate control (' + decodeURIComponent(data.name) + ')@'+ip],
            }
        };
        options.newInstances.push(instance);
        options.log.debug('Add new Daikin Instance');
    }
    callback(null, foundNew, ip);
}

// just check if IP exists
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
    // options.language - language

    // try to detect Daikin
    tools.udpScan(ip, 30050, '0.0.0.0', 30000, 'DAIKIN_UDP/common/basic_info', 1000, function (err, result) {
        if (!result) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
            return;
        }
        // Daikin systems respond with HTTP response strings, not JSON objects. JSON is much easier to
    	// parse, so we convert it with some RegExp here.

        function escapeRegExp(str) {
        	return str.replace(/([.*+?^=!:${}()|\[\]\/\\]\")/g, "\\$1");
        	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
        }

        function replaceAll(str, find, replace) {
        	return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
        	// From http://stackoverflow.com/a/1144788
        }

        if (Buffer.isBuffer(result)) {
            result = result.toString();
        }
    	result2 = replaceAll(result, "\=", "\":\"");
    	result2 = replaceAll(result2, ",", "\",\"");

        var responseData = null;
        try {
            responseData = JSON.parse("{\"" + result2 + "\"}");
        }
        catch (e) {
            callback(e, false, ip);
            callback = null;
        }

        if (responseData && responseData.ret && responseData.ret === 'OK') {
            addDaikin(ip, device, responseData, options, function (isAdded) {
                if (callback) {
                    callback(null, isAdded, ip);
                    callback = null;
                }
            });
        }
    });
}



exports.detect  = detect;
exports.type    = ['ip'];// make type=serial for USB sticks
exports.timeout = 1500;
