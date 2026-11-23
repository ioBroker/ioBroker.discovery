'use strict';

/**
 * Tests for the IPP/IPPS printer detection module.
 * These are synthetic mDNS fixtures, not captures from physical printers.
 */

const assert = require('node:assert');
const path = require('node:path');

const ipp = require(path.join('..', '..', 'build', 'lib', 'adapters', 'ipp.js'));

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** Synthetic record shape that exercises the fields consumed by the mDNS helpers. */
function syntheticPrinter({ ip = '192.168.1.50', name, services = ['_ipp._tcp.local'] } = {}) {
    const ptr = { name: services[0] };
    if (name) {
        ptr.data = `${name}.${services[0]}`;
    }
    if (services.length > 1) {
        ptr.namex = services.slice(1);
        if (name) {
            ptr.datax = services.slice(1).map(service => `${name}.${service}`);
        }
    }

    const mdns = { PTR: ptr };
    if (name) {
        const host = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        mdns.SRV = { name: `${name}.${services[0]}`, data: `${host}.local` };
        mdns.A = { name: `${host}.local`, data: ip };
    }

    return { _addr: ip, _type: 'mdns', _source: 'mdns', _mdns: mdns };
}

function detect(device, options, ip = device?._addr || '192.168.1.50') {
    const calls = [];
    ipp.detect(ip, device, options, (...args) => calls.push(args));
    return calls;
}

describe('ipp detection', () => {
    it('recognises IPP and proposes one shared instance without printer configuration', () => {
        const options = freshOptions();
        const ip = '192.168.1.50';
        const calls = detect(syntheticPrinter({ ip, name: 'Office printer' }), options, ip);

        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], [null, true, ip]);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].common.name, 'ipp');
        assert.deepStrictEqual(options.newInstances[0].native, {});
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Office printer (192.168.1.50)']);
    });

    it('recognises IPPS and uses the fallback label when mDNS has no name', () => {
        const options = freshOptions();
        const ip = '192.168.1.51';
        const calls = detect(syntheticPrinter({ ip, services: ['_ipps._tcp.local'] }), options, ip);

        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], [null, true, ip]);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['IPP printer (192.168.1.51)']);
    });

    it('handles both service types in one record without duplicating its label', () => {
        const options = freshOptions();
        const ip = '192.168.1.52';
        const calls = detect(
            syntheticPrinter({ ip, name: 'Shared queue', services: ['_ipp._tcp.local', '_ipps._tcp.local'] }),
            options,
            ip,
        );

        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], [null, true, ip]);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Shared queue (192.168.1.52)']);
    });

    it('does not add the same exact printer label twice', () => {
        const options = freshOptions();
        const device = syntheticPrinter({ name: 'Office printer' });

        const first = detect(device, options);
        const duplicate = detect(device, options);

        assert.strictEqual(first.length, 1);
        assert.deepStrictEqual(first[0], [null, true, '192.168.1.50']);
        assert.strictEqual(duplicate.length, 1);
        assert.deepStrictEqual(duplicate[0], [null, false, '192.168.1.50']);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Office printer (192.168.1.50)']);
    });

    it('collects multiple printers into one shared proposal', () => {
        const options = freshOptions();
        const first = detect(syntheticPrinter({ name: 'Office printer' }), options, '192.168.1.50');
        const second = detect(
            syntheticPrinter({ ip: '192.168.1.53', name: 'Shipping printer', services: ['_ipps._tcp.local'] }),
            options,
            '192.168.1.53',
        );

        assert.deepStrictEqual(first[0], [null, true, '192.168.1.50']);
        assert.deepStrictEqual(second[0], [null, false, '192.168.1.53']);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].comment.add, [
            'Office printer (192.168.1.50)',
            'Shipping printer (192.168.1.53)',
        ]);
        assert.deepStrictEqual(options.newInstances[0].native, {});
    });

    it('extends an existing ipp instance once and forwards the shared-instance result', () => {
        const existing = {
            _id: 'system.adapter.ipp.0',
            common: { name: 'ipp' },
            native: {},
        };
        const options = freshOptions([existing]);
        const first = detect(syntheticPrinter({ name: 'Office printer' }), options);
        const second = detect(
            syntheticPrinter({ ip: '192.168.1.54', name: 'Shipping printer' }),
            options,
            '192.168.1.54',
        );

        assert.deepStrictEqual(first[0], [null, true, '192.168.1.50']);
        assert.deepStrictEqual(second[0], [null, false, '192.168.1.54']);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0]._existing, true);
        assert.deepStrictEqual(options.newInstances[0].native, {});
        assert.deepStrictEqual(options.newInstances[0].comment.extended, [
            'Office printer (192.168.1.50)',
            'Shipping printer (192.168.1.54)',
        ]);
        assert.deepStrictEqual(existing, {
            _id: 'system.adapter.ipp.0',
            common: { name: 'ipp' },
            native: {},
        });
    });

    it('ignores nonmatching and partial mDNS records without calling back more than once', () => {
        const options = freshOptions();
        const devices = [
            {},
            { _mdns: {} },
            { _mdns: { PTR: { data: '_http._tcp.local' }, SRV: null } },
            { _mdns: { PTR: { data: '_ipp._tcp.local' } } },
        ];

        const calls = devices.map(device => detect(device, options));

        assert.deepStrictEqual(calls.slice(0, 3).map(result => result.length), [1, 1, 1]);
        assert.deepStrictEqual(calls.slice(0, 3).map(result => result[0]), [
            [null, false, '192.168.1.50'],
            [null, false, '192.168.1.50'],
            [null, false, '192.168.1.50'],
        ]);
        assert.strictEqual(calls[3].length, 1);
        assert.deepStrictEqual(calls[3][0], [null, true, '192.168.1.50']);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['IPP printer (192.168.1.50)']);
    });

    it('uses mDNS discovery with the expected detection timeout', () => {
        assert.deepStrictEqual(ipp.type, ['mdns']);
        assert.strictEqual(ipp.timeout, 1500);
    });
});
