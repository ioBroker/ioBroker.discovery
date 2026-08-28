'use strict';

/**
 * Tests for the Deye / Solarman detection module.
 *
 * The stick is probed on its AP configuration port 48899 with `WIFIKIT-214028-READ` and
 * answers `<ip>,<mac>,<serial>` - the format pysolarmanv5 documents. A local UDP responder
 * stands in for the logger.
 */

const assert = require('node:assert');
const dgram = require('node:dgram');
const path = require('node:path');

const deyeidc = require(path.join('..', '..', 'build', 'lib', 'adapters', 'deyeidc.js'));

const DISCOVERY_PORT = 48899;
const SERIAL = 2712345678;

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** Answer every probe on 127.0.0.1:48899 with whatever `answer(request)` returns */
function startResponder(answer) {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        socket.on('error', reject);
        socket.on('message', (message, remote) => {
            const reply = answer(message.toString());
            if (reply !== null && reply !== undefined) {
                socket.send(Buffer.from(reply), remote.port, remote.address);
            }
        });
        socket.bind(DISCOVERY_PORT, '127.0.0.1', () => resolve(socket));
    });
}

function detect(options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        deyeidc.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('deyeidc answer parsing', () => {
    it('accepts the documented three field answer', () => {
        const info = deyeidc.parseLoggerAnswer(`10.0.0.4,ACDEF012345A,${SERIAL}`, '10.0.0.4');

        assert.deepStrictEqual(info, { ip: '10.0.0.4', mac: 'ACDEF012345A', serial: SERIAL });
    });

    it('rejects an answer from a different address than the one probed', () => {
        // 48899 is a broadcast-ish port; an answer must belong to the device we asked
        assert.strictEqual(deyeidc.parseLoggerAnswer(`10.0.0.9,ACDEF012345A,${SERIAL}`, '10.0.0.4'), null);
    });

    it('rejects the HF-LPB100 answer that shares this port', () => {
        // an HF-LPB100 module replies `ip,mac,type` - the third field is not a number
        assert.strictEqual(deyeidc.parseLoggerAnswer('10.0.0.4,ACDEF012345A,HF-LPB100', '10.0.0.4'), null);
    });

    it('rejects an implausibly short serial, just like the adapter does', () => {
        assert.strictEqual(deyeidc.parseLoggerAnswer('10.0.0.4,ACDEF012345A,12345', '10.0.0.4'), null);
    });

    it('rejects junk, empty and truncated answers', () => {
        assert.strictEqual(deyeidc.parseLoggerAnswer(null, '10.0.0.4'), null);
        assert.strictEqual(deyeidc.parseLoggerAnswer('', '10.0.0.4'), null);
        assert.strictEqual(deyeidc.parseLoggerAnswer('10.0.0.4,ACDEF012345A', '10.0.0.4'), null);
        assert.strictEqual(deyeidc.parseLoggerAnswer('AT+YZAPP', '10.0.0.4'), null);
    });
});

describe('deyeidc detection', () => {
    it('gives the watchdog more room than the probe needs', () => {
        assert.ok(deyeidc.timeout > 1400, `timeout ${deyeidc.timeout}`);
        assert.deepStrictEqual(deyeidc.type, ['ip']);
    });

    it('sends exactly the request the logger expects', async function () {
        this.timeout(5000);
        let seen = null;
        const responder = await startResponder(request => {
            seen = request;
            return `127.0.0.1,ACDEF012345A,${SERIAL}`;
        });

        try {
            await detect(freshOptions());
            assert.strictEqual(seen, 'WIFIKIT-214028-READ');
        } finally {
            responder.close();
        }
    });

    it('creates an instance and fills in the logger serial', async function () {
        this.timeout(5000);
        const responder = await startResponder(() => `127.0.0.1,ACDEF012345A,${SERIAL}`);
        const options = freshOptions();

        try {
            const { err, found } = await detect(options);

            assert.strictEqual(err, null);
            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0].common.name, 'deyeidc');
            assert.strictEqual(options.newInstances[0].native.ipaddress, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.port, 8899);
            // the value the user would otherwise have to read off the stick by hand
            assert.strictEqual(options.newInstances[0].native.logger, SERIAL);
        } finally {
            responder.close();
        }
    });

    it('ignores a device that answers something else on that port', async function () {
        this.timeout(5000);
        const responder = await startResponder(() => '127.0.0.1,ACDEF012345A,HF-LPB100');
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            responder.close();
        }
    });

    it('reports not found when nothing answers', async function () {
        this.timeout(5000);
        const options = freshOptions();

        const { found } = await detect(options);

        assert.strictEqual(found, false);
    });

    it('does not propose a second instance for a configured logger', async function () {
        this.timeout(5000);
        const responder = await startResponder(() => `127.0.0.1,ACDEF012345A,${SERIAL}`);
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.deyeidc.0',
            common: { name: 'deyeidc' },
            native: { ipaddress: '127.0.0.1', logger: SERIAL },
        });

        try {
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            responder.close();
        }
    });
});
