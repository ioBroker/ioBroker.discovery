'use strict';

/**
 * Tests for the sungrow-local detection module.
 *
 * The record shapes are those the mdns method delivered for a real WiNet-S2 (SH20T inverter with
 * an SBH400 battery) and for a UniFi gateway reflecting its answers into another network - after
 * the discovery core merged all answers of one address into one device.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const sungrowLocal = require(build('adapters', 'sungrow-local.js'));

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** Encode strings the way they travel in a TXT record: length-prefixed */
function txtBuffer(parts) {
    return Buffer.concat(parts.map(part => Buffer.concat([Buffer.from([part.length]), Buffer.from(part)])));
}

const winetTxt = ip =>
    txtBuffer([
        'battery1=2;200;8441;S2400000001;1;516;SBH400-V11;',
        `ethinfo=${ip};`,
        'inverter=1;3622;A2400000001;1;516;SH20T;1;4;',
        'board=SUNGROW;1;WiNet-S2;B2400000001;1;',
    ]);

/** The WiNet as the mdns method reports it: service list, PTR, SRV and TXT, but no A record */
function winet(ip, txt = winetTxt(ip)) {
    return {
        _addr: ip,
        _type: 'mdns',
        _source: 'mdns',
        _name: '_services._dns-sd._udp.local',
        _mdns: {
            ip,
            type: 'answer',
            name: '_http._tcp.local',
            PTR: {
                name: '_services._dns-sd._udp.local',
                data: '_http._tcp.local',
                namex: ['_services._dns-sd._udp.local', '_http._tcp.local'],
                datax: ['_http._tcp.local', 'WiNet-WebServer._http._tcp.local'],
            },
            SRV: {
                name: 'WiNet-WebServer._http._tcp.local',
                data: { priority: 0, weight: 0, port: 80, target: 'SUNGROWB2400000001.local' },
            },
            TXT: { name: 'WiNet-WebServer._http._tcp.local', data: txt },
        },
    };
}

function detect(device, options) {
    return new Promise(resolve => {
        sungrowLocal.detect(device._addr, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('sungrow-local detection', () => {
    it('recognises a WiNet-S2 by its web server announcement', async () => {
        const options = freshOptions();

        const { err, found, addr } = await detect(winet('192.168.1.40'), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(addr, '192.168.1.40');
        assert.strictEqual(options.newInstances.length, 1);
        const proposal = options.newInstances[0];
        assert.strictEqual(proposal._id, 'system.adapter.sungrow-local.0');
        assert.strictEqual(proposal.common.name, 'sungrow-local');
        // only the address, and read-only for the first start
        assert.deepStrictEqual(proposal.native, { host: '192.168.1.40', readOnly: true });
        assert.deepStrictEqual(proposal.comment.add, ['Sungrow SH20T via WiNet-S2 B2400000001 (192.168.1.40)']);
    });

    it('reads the TXT record after the discovery core merged it into a plain object', async () => {
        const options = freshOptions();
        const device = winet('192.168.1.40');
        // what main.ts addDevice makes of a Buffer when it merges a later answer into the device
        device._mdns.TXT.data = Object.assign({}, [...device._mdns.TXT.data]);

        const { found } = await detect(device, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, [
            'Sungrow SH20T via WiNet-S2 B2400000001 (192.168.1.40)',
        ]);
    });

    it('recognises the module by its host name when the TXT record is missing', async () => {
        const options = freshOptions();
        const device = winet('192.168.1.40');
        delete device._mdns.TXT;

        const { found } = await detect(device, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Sungrow inverter via WiNet (192.168.1.40)']);
    });

    it('does not take an mDNS reflector for the module', async () => {
        const options = freshOptions();
        // A UniFi gateway repeating the WiNet's answers from its own address, its A record included
        const reflector = winet('192.168.1.1', winetTxt('192.168.20.40'));
        reflector._mdns.A = { name: 'SUNGROWB2400000001.local', data: '192.168.20.40' };

        const { found } = await detect(reflector, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('does not take a reflector for the module even without the A record', async () => {
        const options = freshOptions();
        const reflector = winet('192.168.1.1', winetTxt('192.168.20.40'));

        const { found } = await detect(reflector, options);

        assert.strictEqual(found, false);
    });

    it('ignores another web server', async () => {
        const options = freshOptions();
        const device = winet('192.168.1.41');
        device._mdns.PTR.datax = ['_http._tcp.local', 'switch6b2d74._http._tcp.local'];
        device._mdns.SRV = {
            name: 'switch6b2d74._http._tcp.local',
            data: { priority: 0, weight: 0, port: 80, target: 'switch6b2d74.local' },
        };
        delete device._mdns.TXT;

        const { found } = await detect(device, options);

        assert.strictEqual(found, false);
    });

    it('leaves a configured instance for the same module alone', async () => {
        const options = freshOptions([
            {
                _id: 'system.adapter.sungrow-local.0',
                common: { name: 'sungrow-local' },
                native: { host: '192.168.1.40' },
            },
        ]);

        const { found } = await detect(winet('192.168.1.40'), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes a second instance for a second plant', async () => {
        const options = freshOptions([
            {
                _id: 'system.adapter.sungrow-local.0',
                common: { name: 'sungrow-local' },
                native: { host: '192.168.1.40' },
            },
        ]);

        const { found } = await detect(winet('192.168.1.42'), options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0]._id, 'system.adapter.sungrow-local.1');
        assert.strictEqual(options.newInstances[0].native.host, '192.168.1.42');
    });
});
