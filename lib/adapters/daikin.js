'use strict';

const tools = require('../tools.js');

function addDaikin(ip, device, data, options) {
    let foundNew = false;
    let instance = tools.findInstance(options, 'daikin', obj => {
        const matchFound = (obj.native.daikinIp === ip || obj.native.daikinIp === device._name);
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
                add: ['Daikin climate control (' + decodeURIComponent(data.name) + ')@' + ip],
            }
        };
        options.newInstances.push(instance);
        options.log.debug('Add new Daikin Instance ' + ip);
    }
    return foundNew;
}

// just check if IP exists
function detect(ip, device, options, callback) {
    let found = false;
    tools.udpScan(ip, 30050, '0.0.0.0', 30000, 'DAIKIN_UDP/common/basic_info', 3000, false, (err, result, remote) => {
        if (!result) {
            callback(err, found, ip);
            return;
        }
        // Daikin systems respond with HTTP response strings, not JSON objects. JSON is much easier to
    	// parse, so we convert it with some RegExp here.

        function escapeRegExp(str) {
        	return str.replace(/([.*+?^=!:${}()|\[\]\/\\]")/g, '\\$1');
        	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
        }

        function replaceAll(str, find, replace) {
        	return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
        	// From http://stackoverflow.com/a/1144788
        }

        if (Buffer.isBuffer(result)) {
            result = result.toString();
        }
    	let result2 = replaceAll(result, '\=', '":"');
    	result2 = replaceAll(result2, ',', '","');

        let responseData = null;
        try {
            responseData = JSON.parse('{"' + result2 + '"}');
        } catch (e) {
            options.log.debug('Invalid response from Daikin device: {' + result2 + '}: ' + e.message);
            return;
        }

        if (responseData && responseData.ret && responseData.ret === 'OK') {
            found = found  || addDaikin(remote.address, device, responseData, options);
        }
    });
}

exports.detect  = detect;
exports.type    = ['udp'];// make type=serial for USB sticks // TODO make to once
exports.timeout = 500;
