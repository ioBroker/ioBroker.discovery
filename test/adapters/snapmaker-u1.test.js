'use strict';

const assert = require('node:assert');
const path = require('node:path');
const mod = require('../../build/lib/adapters/snapmaker-u1');
const tools = require('../../build/lib/tools');
// Sanitized real /machine/system_info response: U1, reported base firmware/software 2.0.0,
// captured 2026-11-25. Unneeded identifiers, names and network details were removed.
const capture = require('../fixtures/snapmaker-u1-system-info.json');

const originalHttpGet = tools.httpGet;

function options(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug() {}, info() {}, warn() {}, error() {} },
    };
}

// Source-derived mDNS fixture (not a claimed live capture). Matches Snapmaker's
// zeroconf.py at ed7b3752a9a938c87ee086f3b7b21a9352a2a0c9; MQTT SRV port 1884.
function mdns(model = 'Snapmaker U1') {
    return {
        _addr: '192.0.2.10',
        _type: 'mdns',
        _mdns: {
            PTR: { name: '_snapmaker._tcp.local', data: 'Printer._snapmaker._tcp.local' },
            SRV: { name: 'Printer._snapmaker._tcp.local', data: { port: 1884, target: 'printer.local' } },
            TXT: { data: ['machine_type=' + model, 'sn=not-for-proposal', 'userid=not-for-proposal'] },
        },
    };
}

function detect(device, state, ip = '192.0.2.10') {
    return new Promise(resolve => mod.detect(ip, device, state, (error, found) => resolve({ error, found })));
}

describe('snapmaker-u1 detection', () => {
    afterEach(() => {
        tools.httpGet = originalHttpGet;
    });

    it('identifies the real HTTP capture and proposes only host and Moonraker port', async () => {
        let calls = 0;
        tools.httpGet = (url, ms, callback) => {
            calls++;
            assert.strictEqual(url, 'http://192.0.2.10:7125/machine/system_info');
            assert.ok(ms < mod.timeout);
            callback(null, JSON.stringify(capture), url);
        };
        const state = options();
        assert.deepStrictEqual(await detect({ _addr: '192.0.2.10', _type: 'ip' }, state), { error: null, found: true });
        assert.strictEqual(calls, 1);
        assert.deepStrictEqual(state.newInstances, [
            {
                _id: 'system.adapter.snapmaker-u1.0',
                common: { name: 'snapmaker-u1' },
                native: { host: '192.0.2.10', port: 7125 },
                comment: { add: ['Snapmaker U1', '192.0.2.10'] },
            },
        ]);
    });

    it('uses model-specific mDNS without any HTTP and never uses its MQTT port', async () => {
        tools.httpGet = () => {
            throw new Error('mDNS must not probe HTTP');
        };
        const state = options();
        assert.strictEqual((await detect(mdns(), state)).found, true);
        assert.deepStrictEqual(state.newInstances[0].native, { host: '192.0.2.10', port: 7125 });
        assert.ok(!JSON.stringify(state.newInstances).includes('not-for-proposal'));
        assert.strictEqual((await detect(mdns(), state)).found, false);
        assert.strictEqual(state.newInstances.length, 1);
    });

    it('ignores another Snapmaker model, generic Moonraker and incomplete mDNS', async () => {
        tools.httpGet = () => {
            throw new Error('unrelated mDNS must not probe HTTP');
        };
        const generic = mdns();
        generic._mdns.PTR = { name: '_moonraker._tcp.local', data: 'U1._moonraker._tcp.local' };
        delete generic._mdns.SRV;
        const incomplete = mdns();
        delete incomplete._mdns.TXT;
        for (const device of [mdns('Snapmaker Artisan'), generic, incomplete]) {
            const state = options();
            assert.strictEqual((await detect(device, state)).found, false);
            assert.strictEqual(state.newInstances.length, 0);
        }
    });

    it('skips configured printers before sending any HTTP request', async () => {
        tools.httpGet = () => {
            throw new Error('already configured');
        };
        const state = options([
            { _id: 'system.adapter.snapmaker-u1.0', common: { name: 'snapmaker-u1' }, native: { host: '192.0.2.10' } },
        ]);
        assert.strictEqual((await detect({ _addr: '192.0.2.10' }, state)).found, false);
        assert.strictEqual(state.newInstances.length, 0);
    });

    it('rejects generic Moonraker, wrong models, invalid JSON and HTTP errors', async () => {
        for (const body of [
            'not JSON',
            'null',
            '[]',
            '{"result":{"hostname":"U1","software_version":"paxx12"}}',
            '{"result":{"system_info":{"product_info":{"machine_type":"Snapmaker U10"}}}}',
        ]) {
            tools.httpGet = (url, ms, callback) => callback(null, body, url);
            const state = options();
            assert.strictEqual((await detect({ _addr: '192.0.2.10' }, state)).found, false);
            assert.strictEqual(state.newInstances.length, 0);
        }
        for (const error of ['timeout', 401, 403, 404, 'ECONNREFUSED']) {
            let callbacks = 0;
            tools.httpGet = (url, ms, callback) => {
                callback(error, null, url);
                callback(null, JSON.stringify(capture), url);
            };
            const state = options();
            mod.detect('192.0.2.10', { _addr: '192.0.2.10' }, state, (err, found) => {
                callbacks++;
                assert.strictEqual(err, null);
                assert.strictEqual(found, false);
            });
            assert.strictEqual(callbacks, 1);
            assert.strictEqual(state.newInstances.length, 0);
        }
    });

    it('does not duplicate a proposal when IP probing completes after mDNS detection', async () => {
        let complete;
        tools.httpGet = (url, ms, callback) => {
            complete = () => callback(null, JSON.stringify(capture), url);
        };
        const state = options();
        const pending = detect({ _addr: '192.0.2.10' }, state);
        assert.strictEqual((await detect(mdns(), state)).found, true);
        complete();
        assert.strictEqual((await pending).found, false);
        assert.strictEqual(state.newInstances.length, 1);
    });

    it('creates a separate instance for a second printer', async () => {
        tools.httpGet = (url, ms, callback) => callback(null, JSON.stringify(capture), url);
        const state = options();
        await detect({ _addr: '192.0.2.10' }, state);
        await detect({ _addr: '192.0.2.11' }, state, '192.0.2.11');
        assert.deepStrictEqual(
            state.newInstances.map(instance => instance._id),
            ['system.adapter.snapmaker-u1.0', 'system.adapter.snapmaker-u1.1'],
        );
    });
});
