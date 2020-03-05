'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, native, callback) {
  let instance = tools.findInstance(options, 'smappee', obj => obj.native.ip === ip || obj.native.ip === device._name);

  if (!instance) {
    instance = {
      _id: tools.getNextInstanceID('smappee', options),
      common: {
        name: 'smappee',
        title: 'smappee (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
      },
      native: {
        host: ip
      },
      comment: {
        add: [ip]
      }
    };
    options.newInstances.push(instance);
    callback(null, true, ip);
  } else {
    callback(null, false, ip);
  } // endElse
} // endAddSonnen

function detect(ip, device, options, callback) {
  tools.httpGet('http://' + ip + "/smappee.html", (err, data) => {
    if (err) {
      if (callback) {
        return callback(null, false, ip);
      } // endIf
    }
    if (data) {
      if (data.includes(">Smappee") == true) {
        addInstance(ip, device, options, {
          ip
        }, callback);
      } else if (callback) {
        return callback(null, false, ip);
      } // endElse
    } else {
      if (callback) {
        return callback(null, false, ip);
      } // endIf}
    } // endElse

  });
} // endDetect

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
