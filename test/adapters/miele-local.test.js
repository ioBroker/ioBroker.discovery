'use strict';

/**
 * Tests for the miele-local detection module.
 *
 * The record shapes are those the mdns method delivered for real Miele@home appliances (XKM
 * modules) and for a UniFi gateway reflecting their answers into another network - after the
 * discovery core merged all answers of one address into one device.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const mieleLocal = require(build('adapters', 'miele-local.js'));
const mielecloudservice = require(build('adapters', 'mielecloudservice.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** An appliance as the mdns method reports it: the service list entry plus its own A record */
function appliance(ip, host) {
    return {
        _addr: ip,
        _type: 'mdns',
        _source: 'mdns',
        _name: '_services._dns-sd._udp.local',
        _mdns: {
            ip,
            type: 'answer',
            name: '_services._dns-sd._udp.local',
            PTR: { name: '_services._dns-sd._udp.local', data: '_mieleathome._tcp.local' },
            A: { name: host, data: ip },
        },
    };
}

function detect(module, device, options) {
    return new Promise(resolve => {
        module.detect(device._addr, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('miele-local detection', () => {
    it('recognises an appliance by its service and its own host record', async () => {
        const options = freshOptions();

        const { err, found, addr } = await detect(
            mieleLocal,
            appliance('192.168.1.80', 'Miele-001D63FFFE000001.local'),
            options,
        );

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(addr, '192.168.1.80');
        assert.strictEqual(options.newInstances.length, 1);
        const proposal = options.newInstances[0];
        assert.strictEqual(proposal._id, 'system.adapter.miele-local.0');
        assert.strictEqual(proposal.common.name, 'miele-local');
        assert.deepStrictEqual(proposal.native, { devices: [{ ip: '192.168.1.80' }] });
        assert.deepStrictEqual(proposal.comment.add, ['Miele-001D63FFFE000001 (192.168.1.80)']);
    });

    it('proposes one instance for all appliances of the household', async () => {
        const options = freshOptions();

        const one = await detect(mieleLocal, appliance('192.168.1.80', 'Miele-001D63FFFE000001.local'), options);
        const two = await detect(mieleLocal, appliance('192.168.1.81', 'Miele-001D63FFFE000002.local'), options);
        const again = await detect(mieleLocal, appliance('192.168.1.81', 'Miele-001D63FFFE000002.local'), options);

        assert.strictEqual(one.found, true);
        assert.strictEqual(two.found, false);
        assert.strictEqual(again.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].native.devices, [
            { ip: '192.168.1.80' },
            { ip: '192.168.1.81' },
        ]);
        assert.strictEqual(options.newInstances[0].comment.add.length, 2);
    });

    it('ignores a gateway that reflects the answers of the appliances', async () => {
        const options = freshOptions();
        const reflector = {
            _addr: '192.168.2.1',
            _type: 'mdns',
            _source: 'mdns',
            _name: '_services._dns-sd._udp.local',
            _mdns: {
                ip: '192.168.2.1',
                PTR: { name: '_services._dns-sd._udp.local', data: '_mieleathome._tcp.local' },
                A: {
                    name: 'Miele-001D63FFFE000002.local',
                    data: '192.168.1.82',
                    namex: ['Miele-001D63FFFE000001.local', 'Miele-001D63FFFE000002.local'],
                    datax: ['192.168.1.81', '192.168.1.82'],
                },
            },
        };

        const { found } = await detect(mieleLocal, reflector, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores a device without a Miele host record', async () => {
        const options = freshOptions();
        const serviceOnly = appliance('192.168.1.80', 'Miele-001D63FFFE000001.local');
        delete serviceOnly._mdns.A;
        const otherHost = appliance('192.168.1.80', 'printer.local');

        assert.strictEqual((await detect(mieleLocal, serviceOnly, options)).found, false);
        assert.strictEqual((await detect(mieleLocal, otherHost, options)).found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores other mDNS devices', async () => {
        const options = freshOptions();
        const shelly = {
            _addr: '192.168.1.50',
            _type: 'mdns',
            _source: 'mdns',
            _mdns: {
                PTR: { name: '_services._dns-sd._udp.local', data: '_shelly._tcp.local' },
                A: { name: 'shellyplus1pm-a8032ab1.local', data: '192.168.1.50' },
            },
        };
        const homeConnect = {
            _addr: '192.168.1.83',
            _type: 'mdns',
            _source: 'mdns',
            _mdns: { PTR: { name: '_services._dns-sd._udp.local', data: '_homeconnect._tcp.local' } },
        };

        assert.strictEqual((await detect(mieleLocal, shelly, options)).found, false);
        assert.strictEqual((await detect(mieleLocal, homeConnect, options)).found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('leaves a configured instance alone when it discovers appliances itself', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.miele-local.0',
            common: { name: 'miele-local' },
            native: { autoDiscover: true, devices: [] },
        });

        const { found } = await detect(mieleLocal, appliance('192.168.1.80', 'Miele-001D63FFFE000001.local'), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('extends a configured instance without mDNS by the appliances it does not list', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.miele-local.0',
            common: { name: 'miele-local' },
            native: { autoDiscover: false, devices: [{ ip: '192.168.1.80' }] },
        });

        const known = await detect(mieleLocal, appliance('192.168.1.80', 'Miele-001D63FFFE000001.local'), options);
        const unknown = await detect(mieleLocal, appliance('192.168.1.81', 'Miele-001D63FFFE000002.local'), options);

        assert.strictEqual(known.found, false);
        assert.strictEqual(unknown.found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0]._existing, true);
        assert.deepStrictEqual(options.newInstances[0].native.devices, [
            { ip: '192.168.1.80' },
            { ip: '192.168.1.81' },
        ]);
        assert.deepStrictEqual(options.newInstances[0].comment.extended, ['Miele-001D63FFFE000002 (192.168.1.81)']);
        // the configured instance itself is untouched
        assert.strictEqual(options.existingInstances[0].native.devices.length, 1);
    });

    it('is proposed next to mielecloudservice for the same appliance', async () => {
        const options = freshOptions();
        const device = appliance('192.168.1.80', 'Miele-001D63FFFE000001.local');

        const local = await detect(mieleLocal, device, options);
        const cloud = await detect(mielecloudservice, device, options);

        assert.strictEqual(local.found, true);
        assert.strictEqual(cloud.found, true);
        assert.deepStrictEqual(options.newInstances.map(i => i.common.name).sort(), [
            'miele-local',
            'mielecloudservice',
        ]);
    });
});
