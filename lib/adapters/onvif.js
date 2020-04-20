'use strict';
const tools = require('../tools.js');
const events = require('events');

function addInstance(device, options, cb){
    let instance = tools.findInstance(options, 'onvif', obj => obj.native.host === device.ip);
    if (!instance){
        const id = tools.getNextInstanceID('onvif', options);
        instance = {
            _id:        id, common: {
                name:    'onvif',
                enabled: true,
                title:   obj => obj.common.title
            }, comment: {
                add: ['Camera/NVT ' + device.ip + ':' + device.port]
            }
        };
        options.newInstances.push(instance);
		let splits = device.ip.split('.');
		splits[3] = 1;
		let start_range = splits.join('.');
		splits[3] = 254;
		let end_range = splits.join('.');
        instance.native = {
			"start_range": start_range,
			"end_range": end_range,
			"ports": "80, 8081, " + device.port
        };
        cb && cb(true);
    } else {
        cb && cb(false);
    }
}

function s4() {
	return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
};

function guid() {
	return (s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4());
};

var Discovery = Object.create(new events.EventEmitter());

function Discovery_probe(options, callback) {
	var cams = []
		, errors = []
		, messageID = 'urn:uuid:' + guid()
		, request = Buffer.from(
			'<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">' +
				'<Header>' +
					'<wsa:MessageID xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">' + messageID + '</wsa:MessageID>' +
					'<wsa:To xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>' +
					'<wsa:Action xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>' +
				'</Header>' +
				'<Body>' +
					'<Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
						'<Types>dn:NetworkVideoTransmitter</Types>' +
						'<Scopes />' +
					'</Probe>' +
				'</Body>' +
			'</Envelope>'
		)
		, socket = require('dgram').createSocket('udp4');

	socket.on('error', function(err) {
		Discovery.emit('error', err);
		callback(err, null);
	});

	const listener = function(msg, rinfo) {
		let message = msg.toString();
		options.log.debug('Onvif. listener: msg = ' + JSON.stringify(message));
		options.log.debug('Onvif. listener: rinfo = ' + JSON.stringify(rinfo));
		let start = message.indexOf('<d:XAddrs>') + 10;
		if (start > 10){
			let end = message.indexOf('/onvif/device_service');
			message = message.substring(start, end);
			options.log.debug('Onvif. listener: msg = ' + JSON.stringify(message));
			start = message.indexOf('://') + 3;
			message = message.substring(start);
			message = message.split(':');
			options.log.debug('Onvif. listener ip: ' + message[0] + ':' + message[1]);
			cams.push({
			'ip': message[0],
			'port': message[1]
			});
		}
	};

	socket.on('message', listener);
	socket.send(request, 0, request.length, 3702, '239.255.255.250');

	setTimeout(function() {
		socket.removeListener('message', listener);
		socket.close();
		callback(null, cams);
	}.bind(this), 5000);
};	
	

function detect(ip, device, options, callback){
    function cb(err, is, ip){
        if (callback){
            callback(err, is, ip);
            callback = null;
        }
    }
	
	Discovery_probe(options, (err, cams) => {
		cams.forEach(device => {
			addInstance(device, options, (state) => {
				cb && cb(null, state, ip);
			});
		});
	});
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = 6000;
