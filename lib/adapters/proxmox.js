'use strict';
const https = require('https');
const request = require('request');


var tools = require('../tools.js');


function detect(ip, device, options, callback) {
    var instance = tools.findInstance(options, 'proxmox');  


    var name = ip + (device._name ? (' - ' + device._name) : '');

    _get('https://'+ip +':8006/api2/json//access/ticket','get').then(data => {
        options.log.warn("TEST: "+JSON.stringify(data));
        if (data === "No ticket - "){
            options.log.debug("SUCESS" + data);
            
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('proxmox', options),
                    common: {
                        name: 'proxmox',
                        enabled: true,
                        title: 'proxmox (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                    },
                    native: {
                        ip: ip,
                        port: "8006",
                    },
                    comment: {
                        add: [name]
                    }

                };
                options.newInstances.push(instance);
            }
            callback(null, true, ip);

        }
        else{
            callback(null, false, ip);
        }
        
    });
}

 function _get (ur, verb, data, retry) {
    if (typeof data === 'undefined') data = null;
    if (typeof retry === 'undefined') retry = null;
    var success = function (c) { };
    var error = function (c) { };
    //Promise

    var path = ur || '';
    request({
        method: verb,
        uri: path,
        form: data,
        strictSSL: false,
        headers: {
            'CSRFPreventionToken': "",
            'Cookie': ""
        } 

    }, (err, res, body) => {
        if (err) {
            //options.log.warn('ERROR:' + err);
            error(err);
        }
        else {

            if (res.statusCode == 401 && !retry) {
                //this.adapter.log.warn('401:' + body);
                
                    _get(ur, verb, data, true).then(data => {
                        success(data);
                    });
               
            } else {
                if (res.statusCode == 200) {
                    success(JSON.parse(body));
                } else {
                    success(res.statusMessage + ' - ' + body);
                }
            }
        }

    });

    //Promise
    return {
        then: function (cb) {
            success = cb;
            return this;
        },
        error: function (cb) {
            error = cb;
            return this;
        }
    };


}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
