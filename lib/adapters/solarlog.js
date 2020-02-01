'use strict';

const tools = require('../tools.js');

function addInstance(ip, device, options, native, callback) {
  let instance = tools.findInstance(options, 'solarlog', obj => obj.native.ip === ip || obj.native.ip === device._name);

  if (!instance) {
    instance = {
      _id: tools.getNextInstanceID('solarlog', options),
      common: {
        name: 'solarlog',
        title: 'solarlog (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
      },
      native: {
        host: ip
      },      comment: {
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
  tools.httpGet('http://' + ip, (err, data) => {
    if (err) {
      if (callback) {
        return callback(null, false, ip);
      } // endIf
    } else {
      let testData;
      try {
        testData = JSON.parse(data);
      } catch (e) {
        testData = null;
      }
      if (testData.includes("solar-log") == true) {
        addInstance(ip, device, options, {
          ip
        }, callback);
      } else if (callback) {
        return callback(null, false, ip);
      } // endElse

    } // endElse

  });
} // endDetect

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
