'use strict';

// TODO Delete this detector, because it works only with authorizaion on online server!!

const tools = require('../tools.js');

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
	tools.httpGet('https://api.nuki.io/discover/bridges', 1400, (err, result) => {
        try {
            let bridges = JSON.parse(result).bridges;
            bridges.forEach(bridge =>
                // only works for hardware bridges
                bridge.bridgeId && bridge.ip === ip && addInstance(ip, instances, {bridgeId: bridge.bridgeId}, callback));
        }
        catch(e) {
            callback && callback(e, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
