'use strict';

const tools = require('../tools.js');
const https = require('https');

function addInstance(ip, instances, discovered, callback) {
	let instance = tools.findInstance(instances, 'nuki2', obj => obj.native.bridges && obj.native.bridges.map(bridge => bridge.id).indexOf(discovered.bridgeId) > -1);
    
	if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('nuki2', instances),
            common: {
                name: 'nuki2',
                title: 'Nuki Smart Lock (' + ip + ')'
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
	
	let result = '';
    https.get('https://api.nuki.io/discover/bridges', res =>
	{
		res.on('data', (chunk) => {
			result += chunk;
		});

		res.on('end', () => {
			try
			{
				let bridges = JSON.parse(result).bridges;
				bridges.forEach(bridge =>
				{
					if (bridge.bridgeId && bridge.ip == ip) // only works for hardware bridges
						addInstance(ip, instances, {bridgeId: bridge.bridgeId}, callback);
				});
			}
			catch(e) {
				callback && callback(e, false, ip);
			}
		});
		
		
    }).on('error', e => {
        callback && callback(e, false, ip);
    });
}

exports.detect = detect;
exports.type = ['ip'];
