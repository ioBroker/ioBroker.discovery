'use strict';

//var tools = require('../tools.js');
const http = require('http');
const request = require('request');
const tools = require('../tools.js');

function addInstance(ip, device, options, native, callback) {

    //options.log.debug("ebus addinstance");

    let instance = tools.findInstance(options, 'ebus', obj => obj.native.targetIP === ip);
    if (!instance) {
        options.log.debug("ebus no instance found; add");
        instance = {
            _id: tools.getNextInstanceID('ebus', options),
            common: {
                name: 'ebus',
                title: 'ebus (' + ip + ')'
            },
            native: {
                "targetIP": ip,
                "interfacetype": "ebusd",
                "targetHTTPPort": 8889,
                "targetTelnetPort": 8890
            },
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        options.log.debug("ebus instance already there");
        callback(null, false, ip);
    }
}

function detect(ip, device, options, callback) {

    var sUrl = "http://" + ip + ":8889/data";
    options.log.debug("ebus request data from " + sUrl);

    request(sUrl, function (error, response, body) {

        try {
            if (!error && response.statusCode == 200) {
                var oData = JSON.parse(body);

                var flatten = require('flat');

                var newData = flatten(oData);

                var keys = Object.keys(newData);

                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    var subnames = key.split('.');
                    var temp = subnames.length;

                    if (subnames[0].includes("global") && subnames[1].includes("version")) {

                        //var value = newData[key];

                        //versions check?? to do

                        options.log.info("ebus found; call addinstance");
                        //callback(null, true, ip);
                        addInstance(ip, device, options, { ip }, callback);
                    }

                }
                callback(null, false, ip);
            }
            else {
                callback(null, false, ip);
            }
        }
        catch (e) {
            options.log.error('ebus exception in detect [' + e + ']');
            if (callback) {
                return callback(null, false, ip);
            }
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;