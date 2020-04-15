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

function detect(ip, device, options, callback){
    tools.httpGet('http://' + ip, (err, data) => {
        if (err || !data){
            callback && callback(null, false, ip);
        } else if (data){
            let testData;
            try {
                testData = JSON.stringify(data);
            } catch (e) {
                testData = null;
                callback && callback(null, false, ip);
            }
            if (testData.includes('solar-log') === true){
                addInstance(ip, device, options, {
                    ip
                }, callback);
            } else {
                callback && callback(null, false, ip);
            }
        } else {
            callback && callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
