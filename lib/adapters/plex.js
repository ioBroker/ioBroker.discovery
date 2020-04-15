'use strict';

const http = require('http');
const tools = require('../tools.js');

function addInstance(ip, instances, discovered, callback) {
    let instance = tools.findInstance(instances, 'plex', obj => obj.native.plexIp === ip);
	
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('plex', instances),
            common: {
                name: 'plex',
                title: 'Plex Media Server (' + ip + ')'
            },
            native: {
            },
            comment: {
                add: [ip]
            }
        };
		
        instances.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    }
}

function detect(ip, device, instances, callback) {
    const options = {method: 'HEAD', host: ip, port: 32400, path: '/'};
    const request = http.request(options, function(res) {
        if (res !== undefined && res.headers !== undefined && res.headers['x-plex-protocol'] !== undefined){
            addInstance(ip, instances, {}, callback);
        } else {
            callback && callback(null, false, ip);
            callback = null;
        }
    });
    request.on('error', (e)=> {
        callback && callback(null, false, ip);
        callback = null;
    });
    request.end();
}

exports.detect = detect;
exports.type = ['ip'];
