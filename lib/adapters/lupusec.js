'use strict';

var tools = require('../tools.js');

function addDevice(ip, device, options, callback) {

  var instance = tools.findInstance(options, 'lupusec', function(obj) {
    return (obj.native.alarm_host === ip || obj.native.alarm_host === device._name);
  });

  if (!instance) {

    var id = tools.getNextInstanceID('lupusec', options);
    var name = device._name ? device._name : '';

    tools.words['alarm_user'] = {
      "de": "Lupusec Benutzer eingeben",
      "en": "Lupusec username"
    };

    tools.words['alarm_password'] = {
      "de": "Lupusec Passwort für Benutzer eingeben",
      "en": "Lupusec password for username"
    };

    instance = {
      _id: id,
      common: {
        name: 'lupusec',
        title: 'Lupusec (' + ip + (name ? (' - ' + name) : '') + ')'
      },
      native: {
        alarm_host: ip,
        alarm_port: 80,
        alarm_https: false
      },
      comment: {
        add: 'Lupusec (' + [name, ip] + ')',
        inputs: [{
            name: 'native.alarm_user',
            def: '',
            type: 'text', // text, checkbox, number, select, password. Select requires
            title: 'Lupusec Username' // tools.translate(options.language, 'alarm_user') // see translation in words.js
          },
          {
            name: 'native.alarm_password',
            def: '',
            type: 'password', // text, checkbox, number, select, password. Select requires
            title: 'Lupusec Password' // tools.translate(options.language, 'alarm_password') // see translation in words.js
          }
          /*,
          {
            name: 'native.alarm_password_confirm',
            def: '',
            type: 'password', // text, checkbox, number, select, password. Select requires
            title: 'Confirm Lupusec Password' // tools.translate(options.language, 'alarm_password') // see translation in words.js
          }
          */
        ]
      }
    };
    options.newInstances.push(instance);
    return callback(true);
  } else {
    callback(null, false, ip);
  }
}

// just check if IP exists
function detect(ip, device, options, callback) {

  tools.httpGet('http://' + ip + '/action/logout', function(err, data) {
    if (err) {
      if (callback) {
        callback(null, false, ip);
        callback = null;
      }
    } else {
      var testData;
      try {
        testData = JSON.parse(data);
      } catch (e) {
        testData = null;
      }

      if (testData && testData.result == 1 && testData.message == "{WEB_MSG_SUBMIT_SUCCESS}") {
        addDevice(ip, device, options, callback);
      } else if (callback) {
        callback(null, false, ip);
        callback = null;
      }
    }
  });
}

exports.detect = detect;
exports.type = ['ip']; // make type=serial for USB sticks
