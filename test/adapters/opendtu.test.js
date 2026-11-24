'use strict';

/**
 * Tests for the OpenDTU detection module. OpenDTU (tbnobody/OpenDTU, src/NetworkSettings.cpp,
 * handleMDNS()) registers `_http._tcp` and `_opendtu._tcp` on port 80 under its host name and adds
 * a `git_hash` TXT entry with the firmware version - only when mDNS is switched on in its network
 * settings. The records below are what such an announcement looks like for an OpenDTU with the
 * default host name `OpenDTU` and firmware v26.11.11.
 */

const assert = require('node:assert');
const path = require('node:path');

const opendtu = require(path.join('..', '..', 'build', 'lib', 'adapters', 'opendtu.js'));

const IP = '192.168.20.57';

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function opendtuDevice() {
    return {
        _addr: IP,
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            PTR: {
                name: '_opendtu._tcp.local',
                data: 'OpenDTU._opendtu._tcp.local',
                datax: ['OpenDTU._opendtu._tcp.local', 'OpenDTU._http._tcp.local'],
            },
            SRV: { name: 'OpenDTU._opendtu._tcp.local', data: 'OpenDTU.local' },
            TXT: { data: ['git_hash=v26.11.11'] },
            A: { name: 'OpenDTU.local', data: IP },
        },
    };
}

function detect(device, options, ip = IP) {
    return new Promise(resolve => opendtu.detect(ip, device, options, (err, found) => resolve({ err, found })));
}

describe('opendtu detection', () => {
    it('proposes one instance per OpenDTU with its address', async () => {
        const options = freshOptions();
        const { err, found } = await detect(opendtuDevice(), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        const instance = options.newInstances[0];
        assert.strictEqual(instance._id, 'system.adapter.opendtu.0');
        assert.deepStrictEqual(instance.native, { webUIScheme: 'http', webUIServer: IP, webUIPort: 80 });
        assert.deepStrictEqual(instance.comment.add, ['OpenDTU v26.11.11', IP]);
    });

    it('skips an OpenDTU that already has an instance with its IP address', async () => {
        const existing = {
            _id: 'system.adapter.opendtu.0',
            common: { name: 'opendtu' },
            native: { webUIScheme: 'http', webUIServer: IP, webUIPort: 80 },
        };
        const options = freshOptions([existing]);
        const { found } = await detect(opendtuDevice(), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('skips an OpenDTU that already has an instance with its host name', async () => {
        const existing = {
            _id: 'system.adapter.opendtu.0',
            common: { name: 'opendtu' },
            native: { webUIScheme: 'http', webUIServer: 'opendtu.local', webUIPort: 80 },
        };
        const options = freshOptions([existing]);
        const { found } = await detect(opendtuDevice(), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes a second OpenDTU next to an existing instance for another address', async () => {
        const existing = {
            _id: 'system.adapter.opendtu.0',
            common: { name: 'opendtu' },
            native: { webUIScheme: 'http', webUIServer: '192.168.20.99', webUIPort: 80 },
        };
        const options = freshOptions([existing]);
        const { found } = await detect(opendtuDevice(), options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0]._id, 'system.adapter.opendtu.1');
    });

    it('works without the TXT record', async () => {
        const device = opendtuDevice();
        delete device._mdns.TXT;
        const options = freshOptions();
        const { found } = await detect(device, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['OpenDTU', IP]);
    });

    it('ignores other devices that only announce _http._tcp', async () => {
        const options = freshOptions();
        const other = {
            _addr: '192.168.20.10',
            _mdns: {
                PTR: { name: '_http._tcp.local', data: 'shellyplus1-abc._http._tcp.local' },
                SRV: { name: 'shellyplus1-abc._http._tcp.local', data: 'shellyplus1-abc.local' },
            },
        };
        const { found } = await detect(other, options, '192.168.20.10');

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
