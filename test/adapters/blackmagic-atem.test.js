'use strict';

/**
 * Tests for the Blackmagic ATEM detection module. The records mirror what an ATEM SDI Pro ISO and a
 * HyperDeck Studio HD Plus announced on a live network (avahi-browse -r). The ATEM also announces
 * `_hyperdeck_ctrl._tcp` (with an empty TXT); only `_switcher_ctrl._udp` tells the two apart.
 */

const assert = require('node:assert');
const path = require('node:path');

const atem = require(path.join('..', '..', 'build', 'lib', 'adapters', 'blackmagic-atem.js'));

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function atemDevice() {
    return {
        _addr: '192.168.230.105',
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            PTR: {
                name: '_switcher_ctrl._udp.local',
                data: 'ATEM SDI Pro ISO._switcher_ctrl._udp.local',
                datax: ['ATEM SDI Pro ISO._switcher_ctrl._udp.local', 'ATEM SDI Pro ISO._hyperdeck_ctrl._tcp.local'],
            },
            SRV: { name: 'ATEM SDI Pro ISO._switcher_ctrl._udp.local', data: 'ATEM-SDI-Pro-ISO.local' },
            TXT: { data: ['unique id=012c5723d06c44ada134199c125d83a5'] },
        },
    };
}

function detect(device, options, ip = '192.168.230.105') {
    return new Promise(resolve => atem.detect(ip, device, options, (err, found) => resolve({ err, found })));
}

describe('blackmagic-atem detection', () => {
    it('proposes one instance per switcher, addressed by host', async () => {
        const options = freshOptions();
        const { err, found } = await detect(atemDevice(), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        const instance = options.newInstances[0];
        assert.strictEqual(instance._id, 'system.adapter.blackmagic-atem.0');
        assert.deepStrictEqual(instance.native, { host: '192.168.230.105', model: 'auto', reconnectInterval: 5000 });
        assert.deepStrictEqual(instance.comment.add, ['ATEM SDI Pro ISO', '192.168.230.105']);
    });

    it('skips a switcher that already has an instance', async () => {
        const existing = {
            _id: 'system.adapter.blackmagic-atem.0',
            common: { name: 'blackmagic-atem' },
            native: { host: '192.168.230.105' },
        };
        const options = freshOptions([existing]);
        const { found } = await detect(atemDevice(), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores a HyperDeck, which announces _hyperdeck_ctrl._tcp but no switcher service', async () => {
        const options = freshOptions();
        const hyperdeck = {
            _addr: '192.168.230.202',
            _mdns: {
                PTR: { name: '_hyperdeck_ctrl._tcp.local', data: 'HyperDeck 1._hyperdeck_ctrl._tcp.local' },
                SRV: { name: 'HyperDeck 1._hyperdeck_ctrl._tcp.local', data: 'HyperDeck-1.local' },
                TXT: {
                    data: [
                        'unique id=4620B27005CF49CFAD76EBD8A4042A01',
                        'protocol version=1.19',
                        'name=HyperDeck Studio HD Plus',
                        'class=HyperDeck',
                        'txtvers=1',
                    ],
                },
            },
        };
        const { found } = await detect(hyperdeck, options, '192.168.230.202');

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
