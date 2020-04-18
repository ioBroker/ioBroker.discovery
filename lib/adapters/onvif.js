'use strict';
const tools = require('../tools.js');
let onvif = require('onvif');

function addInstance(device, options, cb){
    let instance = tools.findInstance(options, 'onvif', obj => obj.native.host === device.hostname);
    if (!instance){
        const id = tools.getNextInstanceID('onvif', options);
        instance = {
            _id:        id, common: {
                name:    'onvif',
                enabled: true,
                title:   obj => obj.common.title
            }, comment: {
                add: ['Camera/NVT ' + device.hostname + ':' + device.port]
            }
        };
        options.newInstances.push(instance);
		let splits = device.hostname.split('.');
		splits[3] = 1;
		let start_range = splits.join('.');
		splits[3] = 254;
		let end_range = splits.join('.');
        instance.native = {
			"start_range": start_range,
			"end_range": end_range,
			"ports": "80, 7575, 8000, 8080, 8081, " + device.port
        };
        cb && cb(true);
    } else {
        cb && cb(false);
    }
}

function detect(ip, device, options, callback){
    function cb(err, is, ip){
        if (callback){
            callback(err, is, ip);
            callback = null;
        }
    }
	//options.log.info('Onvif: START');
	//options.log.info('Onvif: ip: ' + JSON.stringify(ip));
	//options.log.info('Onvif: device: ' + JSON.stringify(device));
	//device: {"_addr":"192.168.30.100","_ping":{"alive":true},"_source":"ping","_type":"ip","_name":"camera","_dns":{"hostnames":["camera"]}}
	try{		
		onvif.Discovery.probe(function(err, cams) {
			// function would be called only after timeout (5 sec by default)
			if (err) { options.log.error(err); }
			cams.forEach(function(cam) {
				if (ip === cam.hostname) {
					addInstance(cam, options, (state) => {
						cb && cb(null, state, ip);
					});
				} else {
					cb && cb(null, false, ip);
				}
			});
		});
		
	}catch(e){options.log.error(e);}
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 6000;
