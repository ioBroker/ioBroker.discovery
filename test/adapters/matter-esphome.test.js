'use strict';

/**
 * Tests for the matter and esphome detection modules and for the TXT parser they share.
 *
 * The service types come from the libraries the adapters use: `_matterc._udp` /
 * `_matter._tcp` / `_matterd._udp` from @matter/protocol, `_esphomelib._tcp` from
 * @2colors/esphome-native-api.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const matter = require(build('adapters', 'matter.js'));
const esphome = require(build('adapters', 'esphome.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** Encode key/value pairs the way they travel in a TXT record: length-prefixed strings */
function txtBuffer(pairs) {
    const parts = Object.entries(pairs).map(([k, v]) => {
        const text = Buffer.from(`${k}=${v}`, 'utf8');
        return Buffer.concat([Buffer.from([text.length]), text]);
    });
    return Buffer.concat(parts);
}

function mdnsDevice(records) {
    return { _addr: '192.168.1.60', _type: 'mdns', _source: 'mdns', _mdns: records };
}

function detect(module, device, options, ip = '192.168.1.60') {
    return new Promise(resolve => {
        module.detect(ip, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('tools.mdnsTxt', () => {
    it('reads the length-prefixed wire format', () => {
        const device = mdnsDevice({ TXT: { data: txtBuffer({ DN: 'Kitchen Plug', VP: '4362+1', CM: '1' }) } });

        assert.deepStrictEqual(tools.mdnsTxt(device), { DN: 'Kitchen Plug', VP: '4362+1', CM: '1' });
    });

    it('also accepts an already split array and a single string', () => {
        assert.deepStrictEqual(tools.mdnsTxt(mdnsDevice({ TXT: { data: ['version=2026.6.0', 'board=esp32'] } })), {
            version: '2026.6.0',
            board: 'esp32',
        });
        assert.deepStrictEqual(tools.mdnsTxt(mdnsDevice({ TXT: { data: 'board=esp8266' } })), { board: 'esp8266' });
    });

    it('returns nothing for a device without a TXT record', () => {
        assert.deepStrictEqual(tools.mdnsTxt(mdnsDevice({ PTR: { data: '_matter._tcp.local' } })), {});
        assert.deepStrictEqual(tools.mdnsTxt({ _addr: '1.2.3.4' }), {});
    });
});

describe('matter detection', () => {
    it('proposes a node that is waiting to be commissioned', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_matterc._udp.local' },
            TXT: { data: txtBuffer({ DN: 'Kitchen Plug', VP: '4362+1', CM: '1' }) },
        });

        const { err, found } = await detect(matter, device, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].common.name, 'matter');
        // name and vendor/product from the TXT record end up in the proposal
        assert.ok(options.newInstances[0].comment.add[0].includes('Kitchen Plug'));
        assert.ok(options.newInstances[0].comment.add[0].includes('4362+1'));
    });

    it('ignores a commissioner - that is another controller, not a device', async () => {
        const options = freshOptions();
        const device = mdnsDevice({ PTR: { data: '_matterd._udp.local' } });

        const { found } = await detect(matter, device, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes an already commissioned node while no instance exists', async () => {
        const options = freshOptions();
        const device = mdnsDevice({ PTR: { data: '_matter._tcp.local' } });

        const { found } = await detect(matter, device, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
    });

    it('stays quiet about a commissioned node when an instance is already configured', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.matter.0',
            common: { name: 'matter' },
            native: {},
        });

        const { found } = await detect(matter, mdnsDevice({ PTR: { data: '_matter._tcp.local' } }), options);

        // the node is most likely paired to that very instance
        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('still offers a commissionable node when an instance exists', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.matter.0',
            common: { name: 'matter' },
            native: {},
        });
        const device = mdnsDevice({
            PTR: { data: '_matterc._udp.local' },
            TXT: { data: txtBuffer({ DN: 'New Sensor' }) },
        });

        const { found } = await detect(matter, device, options);

        assert.strictEqual(found, true);
        assert.ok(options.newInstances[0].comment.extended[0].includes('New Sensor'));
    });

    it('falls back to the host name when the TXT record has no device name', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_matterc._udp.local' },
            SRV: { name: 'ABCDEF0123456789.local' },
        });

        await detect(matter, device, options, '10.0.0.5');

        assert.ok(options.newInstances[0].comment.add[0].includes('ABCDEF0123456789'));
    });
});

describe('esphome detection', () => {
    it('creates an instance and names version and board', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_esphomelib._tcp.local' },
            SRV: { name: 'garage-door.local' },
            TXT: { data: txtBuffer({ version: '2026.6.0', board: 'esp32dev' }) },
        });

        const { err, found } = await detect(esphome, device, options, '10.0.0.7');

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].common.name, 'esphome');
        const label = options.newInstances[0].comment.add[0];
        assert.ok(label.includes('garage-door'));
        assert.ok(label.includes('ESPHome 2026.6.0'));
        assert.ok(label.includes('esp32dev'));
        assert.ok(label.includes('10.0.0.7'));
    });

    it('works without a TXT record', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_esphomelib._tcp.local' },
            SRV: { name: 'sensor-1.local' },
        });

        const { found } = await detect(esphome, device, options);

        assert.strictEqual(found, true);
        assert.ok(options.newInstances[0].comment.add[0].includes('sensor-1'));
    });

    it('collects several nodes in one instance', async () => {
        const options = freshOptions();
        const make = name => mdnsDevice({ PTR: { data: '_esphomelib._tcp.local' }, SRV: { name } });

        const first = await detect(esphome, make('node-a.local'), options, '10.0.0.7');
        const second = await detect(esphome, make('node-b.local'), options, '10.0.0.8');

        assert.strictEqual(first.found, true);
        assert.strictEqual(second.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].comment.add.length, 2);
    });

    it('ignores a device announcing another service', async () => {
        const options = freshOptions();
        const { found } = await detect(esphome, mdnsDevice({ PTR: { data: '_http._tcp.local' } }), options);

        assert.strictEqual(found, false);
    });
});
