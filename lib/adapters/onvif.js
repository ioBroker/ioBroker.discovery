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
                enabled: false,
                title:   obj => obj.common.title
            }, comment: {
                add: ['Camera/NVT ' + device.hostname]
            }
        };
        options.newInstances.push(instance);
        instance.native = {
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

	onvif.Discovery.on('device', function(cam, rinfo, xml){
		// function will be called as soon as NVT responds
		adapter.log.info('Onvif: Reply from ' + rinfo.address);
		adapter.log('Onvif: Camera/NVT ' + cam.hostname + ':' + cam.port + cam.path);
		addInstance(cam, options, (state) => {
			cb && cb(null, state, ip);
		});
	})
	onvif.Discovery.probe();
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = 10000;
