'use strict';

/**
 * Tests for the mDNS detection modules (shelly, elgato-key-light, homewizard, samsungtv,
 * zeptrion) and for the mDNS helpers they share in lib/tools.
 *
 * The service types asserted here were read out of each adapter's own discovery code, not
 * guessed - see the comments in the modules themselves.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const shelly = require(build('adapters', 'shelly.js'));
const elgato = require(build('adapters', 'elgato-key-light.js'));
const homewizard = require(build('adapters', 'homewizard.js'));
const samsungtv = require(build('adapters', 'samsungtv.js'));
const zeptrion = require(build('adapters', 'zeptrion.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** A device as the mdns method builds it: `_mdns` mirrors the record types of the answer */
function mdnsDevice(records, name) {
    return {
        _addr: '192.168.1.50',
        _type: 'mdns',
        _source: 'mdns',
        _name: name,
        _mdns: records,
    };
}

function detect(module, device, options, ip = '192.168.1.50') {
    return new Promise(resolve => {
        module.detect(ip, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('tools mDNS helpers', () => {
    it('reads a single value and the collision array alike', () => {
        const device = mdnsDevice({
            PTR: { name: '_elg._tcp.local', data: '_elg._tcp.local', datax: ['_elg._tcp.local', '_http._tcp.local'] },
        });

        assert.deepStrictEqual(tools.mdnsValues(device, 'PTR', 'data'), [
            '_elg._tcp.local',
            '_elg._tcp.local',
            '_http._tcp.local',
        ]);
        assert.deepStrictEqual(tools.mdnsValues(device, 'SRV', 'data'), []);
    });

    it('finds a service in any record and field', () => {
        const viaPtr = mdnsDevice({ PTR: { data: '_zapp._tcp.local' } });
        const viaSrvName = mdnsDevice({ SRV: { name: 'zapp-14150003._zapp._tcp.local' } });

        assert.strictEqual(tools.hasMdnsService(viaPtr, '_zapp._tcp'), true);
        assert.strictEqual(tools.hasMdnsService(viaSrvName, '_zapp._tcp'), true);
        assert.strictEqual(tools.hasMdnsService(viaPtr, '_elg._tcp'), false);
        assert.strictEqual(tools.hasMdnsService({ _addr: '1.2.3.4' }, '_zapp._tcp'), false);
    });

    it('prefers a real host name over the service type and strips .local', () => {
        const device = mdnsDevice(
            {
                PTR: { data: '_shelly._tcp.local' },
                SRV: { name: 'shellyplus1pm-a8032ab1.local' },
            },
            'fallback',
        );

        assert.strictEqual(tools.mdnsName(device), 'shellyplus1pm-a8032ab1');
        // a device that only announced the service type falls back to its device name
        assert.strictEqual(tools.mdnsName(mdnsDevice({ PTR: { data: '_shelly._tcp.local' } }, 'x.local')), 'x');
    });
});

describe('shelly detection', () => {
    it('recognises generation 2 by its own service type', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_shelly._tcp.local' },
            SRV: { name: 'shellyplus1pm-a8032ab1.local' },
        });

        const { err, found } = await detect(shelly, device, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].common.name, 'shelly');
        assert.ok(options.newInstances[0].comment.add[0].includes('shellyplus1pm-a8032ab1'));
    });

    it('recognises generation 1 by its host name on _http._tcp', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_http._tcp.local' },
            SRV: { name: 'shelly1-A4CF12.local' },
        });

        const { found } = await detect(shelly, device, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
    });

    it('ignores another vendor on _http._tcp', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_http._tcp.local' },
            SRV: { name: 'some-printer.local' },
        });

        const { found } = await detect(shelly, device, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes one instance for several devices and lists them all', async () => {
        const options = freshOptions();
        const first = mdnsDevice({ SRV: { name: 'shelly1-A4CF12.local' } });
        const second = mdnsDevice({ SRV: { name: 'shellyplug-s-B12345.local' } });

        const one = await detect(shelly, first, options, '192.168.1.50');
        const two = await detect(shelly, second, options, '192.168.1.51');

        assert.strictEqual(one.found, true);
        // the second device must not create a second proposal
        assert.strictEqual(two.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].comment.add.length, 2);
    });

    it('offers a device as an addition when an instance already exists', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.shelly.0',
            common: { name: 'shelly' },
            native: {},
        });

        const { found } = await detect(shelly, mdnsDevice({ SRV: { name: 'shelly1-A4CF12.local' } }), options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        // an existing instance is extended, not re-proposed
        assert.strictEqual(options.newInstances[0]._existing, true);
        assert.ok(options.newInstances[0].comment.extended[0].includes('shelly1-A4CF12'));
    });
});

describe('elgato-key-light detection', () => {
    it('creates an instance for a light on _elg._tcp', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_elg._tcp.local' },
            SRV: { name: 'Elgato Key Light 4B2C.local' },
        });

        const { found } = await detect(elgato, device, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].common.name, 'elgato-key-light');
    });

    it('ignores a device announcing a different service', async () => {
        const options = freshOptions();
        const { found } = await detect(elgato, mdnsDevice({ PTR: { data: '_hap._tcp.local' } }), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('homewizard detection', () => {
    it('accepts the current service type', async () => {
        const options = freshOptions();
        const { found } = await detect(homewizard, mdnsDevice({ PTR: { data: '_hwenergy._tcp.local' } }), options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].common.name, 'homewizard');
    });

    it('accepts the older service type of previous firmware', async () => {
        const options = freshOptions();
        const { found } = await detect(homewizard, mdnsDevice({ PTR: { data: '_homewizard._tcp.local' } }), options);

        assert.strictEqual(found, true);
    });
});

describe('samsungtv detection', () => {
    it('recognises a TV by the multiscreen service', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_samsungmsf._tcp.local' },
            SRV: { name: 'Samsung 7 Series.local' },
        });

        const { found } = await detect(samsungtv, device, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].common.name, 'samsungtv');
    });

    it('does not claim a plain AirPlay device', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_airplay._tcp.local' },
            SRV: { name: 'Apple TV.local' },
        });

        const { found } = await detect(samsungtv, device, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('zeptrion detection', () => {
    it('puts the address into native.devices', async () => {
        const options = freshOptions();
        const device = mdnsDevice({
            PTR: { data: '_zapp._tcp.local' },
            SRV: { name: 'zapp-14150003.local' },
        });

        const { found } = await detect(zeptrion, device, options, '10.0.0.8');

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].native.devices, [
            { host: '10.0.0.8', name: 'zapp-14150003' },
        ]);
    });

    it('collects several actuators in one instance', async () => {
        const options = freshOptions();
        const make = name => mdnsDevice({ PTR: { data: '_zapp._tcp.local' }, SRV: { name } });

        await detect(zeptrion, make('zapp-14150003.local'), options, '10.0.0.8');
        const second = await detect(zeptrion, make('zapp-14150004.local'), options, '10.0.0.9');

        assert.strictEqual(second.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].native.devices.length, 2);
    });

    it('does not add the same address twice', async () => {
        const options = freshOptions();
        const device = mdnsDevice({ PTR: { data: '_zapp._tcp.local' }, SRV: { name: 'zapp-14150003.local' } });

        await detect(zeptrion, device, options, '10.0.0.8');
        await detect(zeptrion, device, options, '10.0.0.8');

        assert.strictEqual(options.newInstances[0].native.devices.length, 1);
        assert.strictEqual(options.newInstances[0].comment.add.length, 1);
    });
});
