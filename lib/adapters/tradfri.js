// We need to find services for _coap._udp

// name = _mdns.name 'gw-a0cc2b6f6b31'
// [?] fqdn = _mdns.SRV.name 'gw-a0cc2b6f6b31._coap._udp.local',
// host = _mdns.SRV.data.target 'TRADFRI-Gateway-a0cc2b6f6b31.local',
// port = _mdns.SRV.data.port 5684

// Excerpt from a mDNS request
// Answers
// _services._dns-sd._udp.local: type PTR, class IN, _coap._udp.local
// => _coap._udp.local: type PTR, class IN, gw-b072bf257a41._coap._udp.local
// gw-b072bf257a41._coap._udp.local: type TXT, class IN, cache flush
// => gw-b072bf257a41._coap._udp.local: type SRV, class IN, cache flush, priority 0, weight 0, port 5684, target TRADFRI-Gateway-b072bf257a41.local
// _services._dns-sd._udp.local: type PTR, class IN, _hap._tcp.local
// _hap._tcp.local: type PTR, class IN, TRADFRI gateway._hap._tcp.local
// TRADFRI gateway._hap._tcp.local: type TXT, class IN, cache flush
// TRADFRI gateway._hap._tcp.local: type SRV, class IN, cache flush, priority 0, weight 0, port 80, target TRADFRI-Gateway-b072bf257a41.local
// Additional records
// TRADFRI-Gateway-b072bf257a41.local: type A, class IN, cache flush, addr 192.168.2.102
// TRADFRI-Gateway-b072bf257a41.local: type AAAA, class IN, cache flush, addr fe80::b272:bfff:fe25:7a41

/**
 * Check if the target of the PTR record is a tradfri gateway
 * @param {string} ptrData The target of the PTR record to check
 */
function PTRIsTradfri(ptrData) {
	return /gw\-[a-f0-9]{12}\._coap\._udp\.local/.test(ptrData);
}

function detect(ip, device, options, callback) {

	function fail() {
		callback(null, false, ip);
	}

	// We need to have mdns data with a PTR and SRV record
	if (!device._mdns || !device._mdns.PTR || !device._mdns.SRV) return fail();
	// The PTR must point to a tradfri gateway
	if (!PTRIsTradfri(device._mdns.PTR)) return fail();
	// The SRV must have a port of 5684
	if (device._mdns.SRV.port != 5684) return fail(); // != because we don't know if string or number

	addInstance(ip, device, options, device._mdns, callback);
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;