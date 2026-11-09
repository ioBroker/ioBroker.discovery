'use strict';

/**
 * Tests for the WLED detection module (#501). `datax` only exists once a device has announced
 * a second, different value, so a device with one PTR record carries `data` alone.
 */

const assert = require('node:assert');
const path = require('node:path');

const wled = require(path.join('..', '..', 'build', 'lib', 'adapters', 'wled.js'));

const SERVICES = '_services._dns-sd._udp.local';

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function mdnsDevice(ptr, extra = {}) {
    return { _type: 'mdns', _source: 'mdns', _mdns: { PTR: { name: SERVICES, ...ptr }, ...extra } };
}

function detect(device, options, ip = '192.168.0.5') {
    return new Promise(resolve => {
        wled.detect(ip, device, options, (err, found) => resolve({ err, found }));
    });
}

describe('wled detection', () => {
    it('ignores a device with a single foreign PTR record instead of throwing', async () => {
        const options = freshOptions();
        const { err, found } = await detect(mdnsDevice({ data: '_http._tcp.local' }), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores a device without any PTR record', async () => {
        const options = freshOptions();
        const { found } = await detect({ _type: 'mdns', _mdns: {} }, options);

        assert.strictEqual(found, false);
    });

    it('finds a WLED that announced only its own service', async () => {
        const options = freshOptions();
        const { found } = await detect(mdnsDevice({ data: '_wled._tcp.local' }), options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].common.name, 'wled');
        assert.deepStrictEqual(options.newInstances[0].native, {});
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['WLED (192.168.0.5)']);
    });

    it('finds a WLED among several services', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            data: '_http._tcp.local',
            datax: ['_wled._tcp.local', '_http._tcp.local'],
        });
        const { found } = await detect(device, options);

        assert.strictEqual(found, true);
    });

    it('names the device when it announced a name', async () => {
        const options = freshOptions();
        const device = mdnsDevice(
            { data: 'wled-kitchen._wled._tcp.local' },
            { SRV: { name: 'wled-kitchen._wled._tcp.local' } },
        );
        await detect(device, options);

        assert.deepStrictEqual(options.newInstances[0].comment.add, ['wled-kitchen (192.168.0.5)']);
    });

    it('lists a second WLED of the same scan in the one proposal', async () => {
        const options = freshOptions();
        const device = mdnsDevice({ data: '_wled._tcp.local' });

        assert.strictEqual((await detect(device, options)).found, true);
        assert.strictEqual((await detect(device, options, '192.168.0.6')).found, false);

        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['WLED (192.168.0.5)', 'WLED (192.168.0.6)']);
    });

    it('offers a find as an addition to a configured instance, whatever its native holds', async () => {
        for (const devices of [undefined, [], { old: { ip: '10.0.0.9' } }]) {
            const options = freshOptions([
                { _id: 'system.adapter.wled.0', common: { name: 'wled' }, native: { devices } },
            ]);
            await detect(mdnsDevice({ data: '_wled._tcp.local' }), options);

            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0]._id, 'system.adapter.wled.0');
            assert.deepStrictEqual(options.newInstances[0].comment.extended, ['WLED (192.168.0.5)']);
        }
    });

    it('works on mDNS devices and leaves the watchdog a timeout', () => {
        assert.deepStrictEqual(wled.type, ['mdns']);
        assert.ok(wled.timeout > 0);
    });
});
