'use strict';

/**
 * Tests for the hoymiles detection file (lib/adapters/hoymiles.js).
 *
 * Covers the two bugs in the as-merged version (PR #386 + linter cleanup ea93fb0):
 *
 *   1. require path: '../lib/tools' resolves to lib/lib/tools — does not exist
 *      and crashes module load on first discovery scan.
 *   2. native config schema: produced { host, pollInterval } — but hoymiles
 *      adapter v0.3.x expects { devices: [{ host, enabled }], dataInterval }.
 *      The adapter migration only triggers when devices is undefined; io-package.json
 *      sets devices: [] as default, so the legacy host field is never migrated and
 *      the adapter logs "Local connection enabled but no devices configured".
 */

// ---------------------------------------------------------------------------
// Stub for admin/words.js — required by lib/tools.js but deleted from master
// in 04c0ced. Without this stub the same MODULE_NOT_FOUND error occurs as in
// the existing air-q.test.js file. Install BEFORE requiring tools.js / hoymiles.js.
// ---------------------------------------------------------------------------
const Module = require('node:module');
const _origResolveFilename = Module._resolveFilename;
const STUB_ID = '__hoymiles-test-admin-words-stub__';
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === '../admin/words.js') {
        return STUB_ID;
    }
    return _origResolveFilename.call(this, request, parent, ...rest);
};
require.cache[STUB_ID] = {
    id: STUB_ID,
    filename: STUB_ID,
    loaded: true,
    exports: { translate: () => '', words: {} },
    children: [],
    paths: [],
};

const expect = require('chai').expect;
const net = require('node:net');
const path = require('node:path');
const hoymiles = require(path.join('..', '..', 'lib', 'adapters', 'hoymiles.js'));

const DTU_SERIAL = '116181234567';

function freshOptions() {
    return { newInstances: [], existingInstances: [] };
}

// Build a minimal Hoymiles InfoData response: HM magic + cmd 0xa2 0x01,
// then a length-delimited protobuf string (field 1) carrying the DTU serial.
function buildMockInfoResponse() {
    const sn = Buffer.from(DTU_SERIAL, 'ascii');
    const payload = Buffer.concat([Buffer.from([0x0a, sn.length]), sn]);
    const totalLen = 10 + payload.length;
    const header = Buffer.alloc(10);
    header[0] = 0x48;
    header[1] = 0x4d; // "HM"
    header[2] = 0xa2;
    header[3] = 0x01; // InfoData response
    header[4] = 0x00;
    header[5] = 0x01;
    header[6] = 0x00;
    header[7] = 0x00;
    header[8] = (totalLen >> 8) & 0xff;
    header[9] = totalLen & 0xff;
    return Buffer.concat([header, payload]);
}

describe('hoymiles discovery — module loading', function () {
    it('module loads without throwing (require path is correct)', function () {
        expect(hoymiles).to.be.an('object');
        expect(hoymiles.detect).to.be.a('function');
        expect(hoymiles.type).to.deep.equal(['ip']);
    });
});

describe('hoymiles discovery — native config schema', function () {
    it('produces device-array native shape on successful detection', function (done) {
        const port = 10081;
        const server = net.createServer(socket => {
            socket.on('data', () => socket.write(buildMockInfoResponse()));
        });

        server.once('error', err => {
            if (err.code === 'EADDRINUSE') {
                this && this.skip ? this.skip() : done();
                return;
            }
            done(err);
        });

        server.listen(port, '127.0.0.1', () => {
            const opts = freshOptions();
            hoymiles.detect('127.0.0.1', { _addr: '127.0.0.1' }, opts, (err, found) => {
                server.close(() => {
                    try {
                        expect(err).to.be.null;
                        expect(found).to.equal(true);
                        expect(opts.newInstances).to.have.lengthOf(1);

                        const inst = opts.newInstances[0];
                        expect(inst.common.name).to.equal('hoymiles');
                        expect(inst.common.title).to.include(DTU_SERIAL);

                        // Bug #2: must be device-array, not flat host
                        expect(inst.native).to.have.property('devices');
                        expect(inst.native.devices).to.be.an('array').with.lengthOf(1);
                        expect(inst.native.devices[0]).to.deep.equal({
                            host: '127.0.0.1',
                            enabled: true,
                        });
                        expect(inst.native).to.have.property('dataInterval', 5);
                        expect(inst.native).to.have.property('slowPollFactor', 6);
                        expect(inst.native).to.have.property('enableLocal', true);
                        expect(inst.native).to.not.have.property('host');
                        expect(inst.native).to.not.have.property('pollInterval');

                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            });
        });
    });
});

describe('hoymiles discovery — duplicate prevention', function () {
    it('skips IPs already present in an instance device array', function (done) {
        const opts = {
            newInstances: [
                {
                    _id: 'system.adapter.hoymiles.0',
                    common: { name: 'hoymiles' },
                    native: {
                        enableLocal: true,
                        devices: [{ host: '10.20.30.40', enabled: true }],
                    },
                },
            ],
            existingInstances: [],
        };

        hoymiles.detect('10.20.30.40', { _addr: '10.20.30.40' }, opts, (err, found, ip) => {
            try {
                expect(err).to.be.null;
                expect(found).to.equal(false);
                expect(ip).to.equal('10.20.30.40');
                expect(opts.newInstances).to.have.lengthOf(1);
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    it('still recognises the legacy v0.2.0 flat host field', function (done) {
        const opts = {
            newInstances: [
                {
                    _id: 'system.adapter.hoymiles.0',
                    common: { name: 'hoymiles' },
                    native: { enableLocal: true, host: '10.20.30.41' },
                },
            ],
            existingInstances: [],
        };

        hoymiles.detect('10.20.30.41', { _addr: '10.20.30.41' }, opts, (err, found) => {
            try {
                expect(err).to.be.null;
                expect(found).to.equal(false);
                done();
            } catch (e) {
                done(e);
            }
        });
    });
});
