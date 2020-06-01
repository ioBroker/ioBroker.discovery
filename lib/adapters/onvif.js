'use strict';
const tools = require('../tools.js');
const events = require('events');

function addInstance(device, options, cb){
	// options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['comments'] = {
        "en": "Warning! All Cameras/NVT on the network must have the same user",
		"de": "Warnung! Alle Kameras/NVT im Netzwerk müssen denselben Benutzer haben",
		"ru": "Предупреждение! Все камеры/NVT в сети должны иметь одного и того же пользователя",
		"pt": "Atenção! Todas as câmeras/NVT na rede devem ter o mesmo usuário",
		"nl": "Waarschuwing! Alle camera's/NVT op het netwerk moeten dezelfde gebruiker hebben",
		"fr": "Avertissement! Toutes les caméras/NVT sur le réseau doivent avoir le même utilisateur",
		"it": "Avvertimento! Tutte le telecamere/NVT sulla rete devono avere lo stesso utente",
		"es": "¡Advertencia! Todas las cámaras/NVT en la red deben tener el mismo usuario",
		"pl": "Ostrzeżenie! Wszystkie kamery/NVT w sieci muszą mieć tego samego użytkownika",
		"zh-cn": "警告！网络上的所有摄像机/ NVT必须具有相同的用户"
    };
	
    let instance = tools.findInstance(options, 'onvif', obj => {
		options.log.debug('Onvif. obj = ' + JSON.stringify(obj));
		return obj.common.name === 'onvif';
	});
	
    if (!instance){
		let comment = 'Cameras/NVT - ' + device.count + ' (' + tools.translate(options.language, 'comments') + ')';
		const id = tools.getNextInstanceID('onvif', options);
		
		instance = {
			_id: id,
			common: {
				name:    'onvif',
				enabled: true,
				title:   'Onvif Support'
			},
			comment: {
				add: [comment],
				inputs: [
					{
						name: 'native.user',
						def: 'admin',
						type: 'text', // text, checkbox, number, select, password. Select requires
						title: 'user', // see translation in words.js
						options: { // example for select
							name1: 'value1',
							name2: 'value2',
							name3: 'value3'
						}
					},
					{
						name:  'native.password',
						def:   'admin',
						type:  'password',
						title: 'password' // see translation in words.js
					}
				]
			},
			native: {
				"start_range": device.start_range,
				"end_range": device.end_range,
				"ip_list": device.ip_list,
				"ports": device.ports,
				"autostartDiscovery": true
			}
		};
		options.newInstances.push(instance);
		
		
		cb && cb(true);
    } else {
		options.log.debug('Onvif. The adapter instance is already installed.');
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
			let end = message.indexOf('</d:XAddrs>');
			message = message.substring(start, end);
			options.log.debug('Onvif. listener: msg = ' + JSON.stringify(message));
			start = message.indexOf('://') + 3;
			end = message.indexOf('/onvif/');
			message = message.substring(start, end);
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
		if (err) {
			cb && cb(err, false, ip);
		} else {
			let ports = '';
			let ip_list = [];
			let splits;
			let start_range;
			let end_range;
			let count = 0;
			cams.forEach(device => {
				count++;
				if (ports.indexOf(device.port) < 0){
					if (ports.length > 1) {ports = ports + ', ' + device.port}
					else {ports = device.port}
				}
				if (ip_list.indexOf(device.ip) === -1) ip_list.push(device.ip);
				splits = device.ip.split('.');
				splits[3] = 1;
				start_range = splits.join('.');
				splits[3] = 254;
				end_range = splits.join('.');
			});
			
			device = {
				count: count,
				start_range: start_range,
				end_range: end_range,
				ip_list: ip_list,
				ports: ports
			}
			options.log.debug('Onvif. device = ' + JSON.stringify(device));
			if (count == 0) {
				cb && cb(null, false, ip);
			} else {
				addInstance(device, options, (state) => {
					cb && cb(null, state, ip);
				});
			}
		}
	});
}

exports.detect = detect;
exports.type = ['udp'];
exports.timeout = 6000;
