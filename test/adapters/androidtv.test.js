'use strict';

/**
 * Tests for the androidtv detection module.
 *
 * An Android TV / Google TV device announces `_androidtvremote2._tcp` (port 6466) under the name the user gave it.
 * The port probe is replaced by a stub - no test touches the network.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const androidtv = require(build('adapters', 'androidtv.js'));

const originalTestPort = tools.testPort;
let openPorts;
let probed;

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** A device as the mdns method reports it, optionally with the A record of its answer */
function tv(ip, name, aRecord) {
    const device = {
        _addr: ip,
        _name: '_androidtvremote2._tcp.local',
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            ip,
            type: 'answer',
            name: '_androidtvremote2._tcp.local',
            PTR: {
                name: '_androidtvremote2._tcp.local',
                data: `${name}._androidtvremote2._tcp.local`,
            },
            SRV: { name: `${name}._androidtvremote2._tcp.local`, data: { port: 6466, target: 'Android.local' } },
        },
    };
    if (aRecord) {
        device._mdns.A = { name: 'Android.local', data: aRecord };
    }
    return device;
}

function detect(ip, device, options) {
    return new Promise((resolve, reject) =>
        androidtv.detect(ip, device, options, (err, found) => (err ? reject(err) : resolve(found))),
    );
}

describe('androidtv detection', () => {
    beforeEach(() => {
        openPorts = new Set();
        probed = [];
        tools.testPort = (ip, port, timeout, callback) => {
            probed.push(`${ip}:${port}`);
            setImmediate(() => callback(null, openPorts.has(`${ip}:${port}`), ip, port));
        };
    });

    afterEach(() => {
        tools.testPort = originalTestPort;
    });

    it('proposes one instance with the device as "standard" type', async () => {
        openPorts.add('192.168.20.152:6466');
        const options = freshOptions();
        assert.strictEqual(await detect('192.168.20.152', tv('192.168.20.152', 'SHIELD'), options), true);
        assert.strictEqual(options.newInstances.length, 1);
        const proposal = options.newInstances[0];
        assert.strictEqual(proposal._id, 'system.adapter.androidtv.0');
        assert.deepStrictEqual(proposal.native.devices, [
            {
                enabled: true,
                name: 'SHIELD',
                host: '192.168.20.152',
                connection: 'remote',
                enableIme: true,
                adbPort: 5555,
                wolMac: '',
                wolBroadcast: '',
            },
        ]);
        assert.deepStrictEqual(proposal.comment.add, ['SHIELD (192.168.20.152)']);
    });

    it('collects a second device in the same proposal', async () => {
        openPorts.add('192.168.20.152:6466').add('192.168.20.48:6466');
        const options = freshOptions();
        await detect('192.168.20.152', tv('192.168.20.152', 'SHIELD'), options);
        assert.strictEqual(await detect('192.168.20.48', tv('192.168.20.48', 'Arbeitszimmer'), options), false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(
            options.newInstances[0].native.devices.map(d => d.host),
            ['192.168.20.152', '192.168.20.48'],
        );
        // the same answer twice does not add the device twice
        await detect('192.168.20.48', tv('192.168.20.48', 'Arbeitszimmer'), options);
        assert.strictEqual(options.newInstances[0].native.devices.length, 2);
    });

    it('proposes nothing when the remote port does not answer', async () => {
        const options = freshOptions();
        assert.strictEqual(await detect('192.168.20.152', tv('192.168.20.152', 'SHIELD'), options), false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes nothing for an answer repeated by an mDNS reflector', async () => {
        openPorts.add('192.168.1.1:6466');
        const options = freshOptions();
        assert.strictEqual(await detect('192.168.1.1', tv('192.168.1.1', 'SHIELD', '192.168.20.152'), options), false);
        assert.strictEqual(options.newInstances.length, 0);
        assert.deepStrictEqual(probed, []);
    });

    it('accepts an A record naming the device itself', async () => {
        openPorts.add('192.168.20.152:6466');
        const options = freshOptions();
        assert.strictEqual(
            await detect('192.168.20.152', tv('192.168.20.152', 'SHIELD', '192.168.20.152'), options),
            true,
        );
    });

    it('proposes nothing when an androidtv instance exists', async () => {
        openPorts.add('192.168.20.152:6466');
        const options = freshOptions([
            {
                _id: 'system.adapter.androidtv.0',
                common: { name: 'androidtv' },
                native: { devices: [{ host: '192.168.20.105', name: 'Fire TV' }] },
            },
        ]);
        assert.strictEqual(await detect('192.168.20.152', tv('192.168.20.152', 'SHIELD'), options), false);
        assert.strictEqual(options.newInstances.length, 0);
        assert.deepStrictEqual(probed, []);
    });

    it('ignores devices without the remote service', async () => {
        const options = freshOptions();
        const device = tv('192.168.20.152', 'SHIELD');
        device._name = '_googlecast._tcp.local';
        device._mdns.name = '_googlecast._tcp.local';
        device._mdns.PTR = { name: '_googlecast._tcp.local', data: 'SHIELD._googlecast._tcp.local' };
        device._mdns.SRV = { name: 'SHIELD._googlecast._tcp.local', data: { port: 8009 } };
        assert.strictEqual(await detect('192.168.20.152', device, options), false);
        assert.deepStrictEqual(probed, []);
    });

    it('waits longer than its own probe', () => {
        assert.ok(androidtv.timeout > 1000);
        assert.deepStrictEqual(androidtv.type, ['mdns']);
    });
});
