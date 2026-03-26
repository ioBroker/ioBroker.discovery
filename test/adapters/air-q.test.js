'use strict';

/**
 * Tests for the air-Q detection file (lib/adapters/air-q.js).
 *
 * These tests are written to capture specific bugs that existed in the
 * original implementation. Every test here FAILS against the old code
 * and PASSES against the new code.
 *
 * To verify:
 *   1. git add this file
 *   2. git stash --keep-index     (stashes air-q.js changes, keeps tests)
 *   3. npm test                   → tests FAIL (old air-q.js)
 *   4. git stash pop              (restores new air-q.js)
 *   5. npm test                   → tests PASS
 */

const expect = require('chai').expect;
const http = require('node:http');
const airq = require('../../lib/adapters/air-q.js');

// ---------------------------------------------------------------------------
// Helper: creates a fresh options object (mimics what ioBroker.discovery passes)
// ---------------------------------------------------------------------------
function freshOptions() {
    return { newInstances: [], existingInstances: [] };
}

// ---------------------------------------------------------------------------
// Helper: a tiny HTTP server that pretends to be an air-Q device.
// Responds to GET /ping with { "id": "<deviceId>", "content": "..." }
// ---------------------------------------------------------------------------
let mockServer;
let mockPort;

before(function (done) {
    mockServer = http.createServer((req, res) => {
        if (req.url === '/ping') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    id: 'aabbcc1234567890aabbcc1234567890',
                    content: 'encrypted-test-data',
                }),
            );
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        done();
    });
});

after(function (done) {
    mockServer.close(done);
});

// ===========================================================================
// Bug 1: Old code never called callback on success
//
// Old code (line 82):
//   addInstance(ip, options);
//   // ← function ends, callback never invoked
//
// The discovery framework would wait 1500ms then skip this adapter.
// ===========================================================================
describe('callback is always called', function () {
    it('calls callback with (null, true, ip) on DNS match', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['aabbc_air-q.fritz.box'] } };

        airq.detect('10.0.0.1', device, opts, (err, found, ip) => {
            expect(err).to.be.null;
            expect(found).to.equal(true);
            expect(ip).to.equal('10.0.0.1');
            done();
        });
    });

    it('calls callback with (null, false, ip) when no match', function (done) {
        const opts = freshOptions();
        // DNS doesn't match, and HTTP /ping to 127.0.0.1:1 will get
        // "connection refused" instantly (nothing listens on port 1)
        const device = { _dns: { hostnames: ['some-printer.local'] } };

        airq.detect('127.0.0.1:1', device, opts, (err, found, ip) => {
            expect(err).to.be.null;
            expect(found).to.equal(false);
            expect(ip).to.equal('127.0.0.1:1');
            done();
        });
    });

    it('calls callback when DNS hostnames are missing entirely', function (done) {
        const opts = freshOptions();
        const device = {};

        airq.detect('127.0.0.1:1', device, opts, (err, found, ip) => {
            expect(err).to.be.null;
            expect(found).to.equal(false);
            done();
        });
    });
});

// ===========================================================================
// Bug 2: Old code set native.ip instead of native.deviceIP / native.shortId
//
// Old code:
//   native: { password: '', ip: ip }
//
// But the air-q adapter reads:
//   this.config.deviceIP    — for the IP address
//   this.config.shortId     — for the 5-char device ID
//   this.config.connectViaIP — to skip mDNS search
//
// Result: discovery created an instance the adapter couldn't use.
// ===========================================================================
describe('native config has correct field names', function () {
    it('sets native.deviceIP (not native.ip)', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['aabbc_air-q.fritz.box'] } };

        airq.detect('10.0.0.1', device, opts, () => {
            const inst = opts.newInstances[0];
            expect(inst.native).to.have.property('deviceIP', '10.0.0.1');
            expect(inst.native).to.not.have.property('ip');
            done();
        });
    });

    it('sets native.shortId', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['aabbc_air-q.fritz.box'] } };

        airq.detect('10.0.0.1', device, opts, () => {
            const inst = opts.newInstances[0];
            expect(inst.native).to.have.property('shortId', 'aabbc');
            done();
        });
    });

    it('sets native.connectViaIP to true', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['aabbc_air-q.fritz.box'] } };

        airq.detect('10.0.0.1', device, opts, () => {
            const inst = opts.newInstances[0];
            expect(inst.native).to.have.property('connectViaIP', true);
            done();
        });
    });
});

// ===========================================================================
// Bug 3: Old code only checked hostnames[0]
//
// Old code:
//   found = getDnsNames[0].includes(adapterName);
//
// If the router returns multiple hostnames and the air-q one isn't first,
// the device is missed.
// ===========================================================================
describe('DNS hostname matching', function () {
    it('matches "{shortId}_air-q.fritz.box"', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['aabbc_air-q.fritz.box'] } };

        airq.detect('10.0.0.1', device, opts, (err, found) => {
            expect(found).to.equal(true);
            done();
        });
    });

    it('matches "{shortId}-air-q.fritz.box" (hyphen variant)', function (done) {
        const opts = freshOptions();
        // Some DNS servers convert underscores to hyphens
        const device = { _dns: { hostnames: ['aabbc-air-q.fritz.box'] } };

        airq.detect('10.0.0.2', device, opts, (err, found) => {
            expect(found).to.equal(true);
            done();
        });
    });

    it('ignores non-air-q hostnames', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['apple-tv.fritz.box'] } };

        airq.detect('127.0.0.1:1', device, opts, (err, found) => {
            expect(found).to.equal(false);
            done();
        });
    });

    it('finds air-q even when it is NOT the first hostname', function (done) {
        const opts = freshOptions();
        // Router returns the raw IP first, air-q hostname second
        const device = { _dns: { hostnames: ['192.168.2.22', 'aabbc_air-q.fritz.box'] } };

        airq.detect('10.0.0.4', device, opts, (err, found) => {
            expect(found).to.equal(true);
            done();
        });
    });

    it('extracts the correct 5-char shortId from hostname', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['f00ba_air-q.fritz.box'] } };

        airq.detect('10.0.0.5', device, opts, () => {
            expect(opts.newInstances[0].native.shortId).to.equal('f00ba');
            done();
        });
    });
});

// ===========================================================================
// Bug 4: Old code had no HTTP fallback
//
// Old code: if hostnames were empty → return false. Period.
// New code: falls back to HTTP GET /ping on the device.
// ===========================================================================
describe('HTTP /ping fallback', function () {
    it('falls back to /ping when DNS hostnames are empty', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: [] } };

        // Point at our mock server instead of a real device
        airq.detect('127.0.0.1:' + mockPort, device, opts, (err, found) => {
            expect(found).to.equal(true);
            done();
        });
    });

    it('extracts shortId from /ping response id field', function (done) {
        const opts = freshOptions();
        const device = {};

        airq.detect('127.0.0.1:' + mockPort, device, opts, () => {
            // Mock server returns id "aabbcc1234567890..." → shortId "aabbc"
            expect(opts.newInstances[0].native.shortId).to.equal('aabbc');
            done();
        });
    });
});

// ===========================================================================
// Bug 5: Old code didn't prevent duplicate instances
//
// Old code checked: obj.native.ip === ip
// But it set native.ip, while the new code sets native.deviceIP.
// After fixing the field names, duplicate check must use deviceIP.
// ===========================================================================
describe('duplicate prevention', function () {
    it('does not create a second instance for the same IP', function (done) {
        const opts = freshOptions();
        const device = { _dns: { hostnames: ['aabbc_air-q.fritz.box'] } };

        // First detection — should create instance
        airq.detect('10.0.0.50', device, opts, (err, found1) => {
            expect(found1).to.equal(true);
            expect(opts.newInstances).to.have.lengthOf(1);

            // Second detection with same IP — should NOT create duplicate
            airq.detect('10.0.0.50', device, opts, (err, found2) => {
                expect(found2).to.equal(false);
                expect(opts.newInstances).to.have.lengthOf(1);
                done();
            });
        });
    });
});
