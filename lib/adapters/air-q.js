'use strict';

const tools = require('../tools.js');
const http = require('http');
const adapterName = 'air-q';

/**
 * air-Q devices register on the local network with hostnames following the
 * pattern "{shortId}_air-q" (e.g., "374de_air-q.fritz.box").
 *
 * When ioBroker.discovery pings a device and does a reverse DNS lookup,
 * the hostname ends up in device._dns.hostnames[]. We match against that.
 *
 * This regex matches the shortId (first 5 hex chars of the serial number)
 * from a hostname that contains "_air-q" or "-air-q".
 */
const airQHostnameRegex = /^([a-f0-9]{5})[_-]air-q/i;

/**
 * Creates a new adapter instance for a discovered air-Q device,
 * unless one already exists for this IP or shortId.
 *
 * The native config pre-fills:
 * - connectViaIP: true  — use IP directly, skip mDNS search on startup
 * - deviceIP: the discovered IP address
 * - shortId: extracted from the DNS hostname or /ping response
 * - password: empty — user must enter it after discovery
 */
function addInstance(ip, shortId, options) {

    let instance = tools.findInstance(options, adapterName, obj =>
        obj && obj.native && (obj.native.deviceIP === ip || obj.native.shortId === shortId));

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: 'air-Q (' + shortId + ')'
            },
            encryptedNative: [
                'password'
            ],
            protectedNative: [
                'password'
            ],
            native: {
                password: '',
                shortId: shortId,
                connectViaIP: true,
                deviceIP: ip
            },
            comment: {
                add: ['air-Q ' + shortId, ip]
            }
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

/**
 * Tries to identify an air-Q device by making an HTTP GET request to
 * its /ping endpoint. Every air-Q device responds to this with:
 *
 *   { "id": "374de52b77c66473ed092776cd1dc5fc", "content": "..." }
 *
 * The first 5 characters of "id" are the shortId.
 *
 * This is the fallback when reverse DNS doesn't contain the hostname
 * (e.g. on networks without a Fritz!Box or similar local DNS).
 */
function probeHttpPing(ip, options, callback) {
    const req = http.get('http://' + ip + '/ping', res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data && typeof data.id === 'string' && data.id.length >= 5) {
                    const shortId = data.id.substring(0, 5);
                    const found = addInstance(ip, shortId, options);
                    callback(null, found, ip);
                } else {
                    callback(null, false, ip);
                }
            } catch (e) {
                // Response wasn't valid JSON — not an air-Q
                callback(null, false, ip);
            }
        });
    });

    req.on('error', () => {
        // Connection refused, timeout, etc. — not an air-Q (or not reachable)
        callback(null, false, ip);
    });
}

/**
 * Detection function called by ioBroker.discovery for each device found via ping.
 *
 * Two-stage detection:
 *   1. Fast path: check reverse DNS hostname for the "_air-q" pattern.
 *      This is instant (no network request) and works on networks where
 *      the router registers local device names in DNS (e.g. Fritz!Box).
 *
 *   2. Fallback: HTTP GET to /ping endpoint on the device.
 *      This works on ANY network but requires an HTTP round-trip.
 *      Only attempted if DNS matching didn't find anything.
 */
function detect(ip, device, options, callback) {
    // Stage 1: try reverse DNS hostname matching (instant, no network request)
    const hostnames = device._dns && device._dns.hostnames;
    if (hostnames && hostnames.length) {
        for (const hostname of hostnames) {
            const match = airQHostnameRegex.exec(hostname);
            if (match) {
                const shortId = match[1];
                const found = addInstance(ip, shortId, options);
                return callback(null, found, ip);
            }
        }
    }

    // Stage 2: DNS didn't match — fall back to HTTP /ping probe
    probeHttpPing(ip, options, callback);
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
