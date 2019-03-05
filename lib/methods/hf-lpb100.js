/**
 * Detects WiFi devices with the HF-LPB100 chip like
 * Mi-Light and G-Homa
 */

// The results are devices of the form
// {
//     _addr: device.ip,
//     _name: device.type, // usually 'HF-LPB100'
//     _hf_lpb100: {
//         mac: device.mac,
//         type: device.type, // usually 'HF-LPB100'
//         networkSettings: device.networkSettings, // the response to AT+NETP\r... empty for MiLight, contains G-Homa network settings
//     }
// }

'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');

const DISCOVERY_PORT = 48899;
const PASSWORD = 'HF-A11ASSISTHREAD';

/**
 * Sends a message via UDP to the given IP
 * @param {dgram.Socket} socket The UDP socket to send the message on
 * @param {string | Buffer} msg The message to send
 * @param {string} ip The IP to send the message to
 */
function send(socket, msg, ip) {
	if (typeof msg === 'string') msg = tools.Buffer_from(msg, 'ascii');
	socket.send(msg, 0, msg.length, DISCOVERY_PORT, ip);
}

/** 
 * Parses a received response
 * @param {string} response
 */
function parseHelloResponse(response) {
	try {
		const parts = response.split(',');
		return {
			ip: parts[0],
			mac: parts[1],
			type: parts[2],
		};
	} catch (e) {
		return null;
	}
}


function discover(self) {

	self.adapter.log.info('Discovering devices with a HF-LPB100 chipset...');

	const result = new Map();
	/**
	 * Handles a response from a device
	 * @param {Buffer} msg The received message
	 * @param {dgram.RemoteInfo} rinfo Information about the other endpoint
	 */
	function handleDiscoverResponse(msg, rinfo) {
		if (msg.length && rinfo.port === 48899) {
			const msgAsString = msg.toString('ascii');
			if (tools.startsWith(msgAsString, rinfo.address)) {
				// The response to the 'hello' starts with the IP
				const response = parseHelloResponse(msgAsString);
				if (response) {
					result.set(response.ip, response);
				}
				// We want to find out some more about the device
				// acknowledge the response
				send(socket, '+ok', rinfo.address);
				// and ask about the server info
				setTimeout(() => send(socket, 'AT+NETP\r', rinfo.address), 100);
			} else if (result.has(rinfo.address) && tools.startsWith(msgAsString, '+ok=')) {
				// This is the response to AT+NETP\r
				// store it
				result.get(rinfo.address).networkSettings = msgAsString.substr(4);
			}
		}
	}

	const socket = dgram
		.createSocket({type: 'udp4', reuseAddr: true})
		.once('listening', () => {
			socket.setBroadcast(true);
			const broadcastAddresses = tools.getBroadcastAddresses();
			// Start interview with all devices reachable under each broadcast address
			broadcastAddresses.forEach(address => send(socket, PASSWORD, address));
		})
		.on('error', e => self.adapter.log.console.error(e)) // log error
		.on('message', handleDiscoverResponse);

	socket.bind(0); // listen on a random free port

	setTimeout(() => {
		socket.close();
		const values = result.values();
		for (const device of values) {
			self.addDevice({
				_addr: device.ip,
				_name: device.type,
				_hf_lpb100: {
					mac: device.mac,
					type: device.type,
					networkSettings: device.networkSettings,
				}
			});
		}
		self.done();
	}, self.options.timeout || 10000);

}

module.exports = {
	browse: discover,
	type: 'hf-lpb100',
	source: 'HF-LPB100',
	timeout: 10000,
};
