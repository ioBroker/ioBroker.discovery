'use strict';

/**
 * Tests for the Zendure detection file (src/lib/adapters/zendure-solarflow.js).
 *
 * zenSDK devices announce `Zendure-<model>-<serial>._zendure._tcp.local` over mDNS
 * (https://github.com/Zendure/zenSDK).
 */

const assert = require('node:assert');
const path = require('node:path');
const zendure = require(path.join('..', '..', 'build', 'lib', 'adapters', 'zendure-solarflow.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function mdnsDevice(records, ip = '192.168.1.60') {
    return { _addr: ip, _type: 'mdns', _source: 'mdns', _mdns: records };
}

function zendureDevice(serviceName, ip) {
    return mdnsDevice(
        {
            PTR: { name: '_zendure._tcp.local', data: `${serviceName}._zendure._tcp.local` },
            SRV: { name: `${serviceName}._zendure._tcp.local` },
        },
        ip,
    );
}

function detect(device, options, ip = '192.168.1.60') {
    return new Promise(resolve => {
        zendure.detect(ip, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('zendure-solarflow detection', () => {
    it('recognises a zenSDK device by its service type', async () => {
        const options = freshOptions();

        const { err, found } = await detect(zendureDevice('Zendure-SolarFlow800-WOB1NHMAMXXXXX3'), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].common.name, 'zendure-solarflow');
        // the default `authKey` mode never starts the mDNS browser without a cloud key
        assert.strictEqual(options.newInstances[0].native.connectionMode, 'local');
        assert.ok(options.newInstances[0].comment.add[0].includes('Zendure-SolarFlow800-WOB1NHMAMXXXXX3'));
    });

    it('ignores other mDNS services', async () => {
        const options = freshOptions();
        const device = mdnsDevice({ PTR: { data: '_http._tcp.local' }, SRV: { name: 'some-printer.local' } });

        const { found } = await detect(device, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes one instance for several devices', async () => {
        const options = freshOptions();

        const one = await detect(zendureDevice('Zendure-SolarFlow800-AAAA', '192.168.1.60'), options, '192.168.1.60');
        const two = await detect(
            zendureDevice('Zendure-solarFlow2400AC+-BBBB', '192.168.1.61'),
            options,
            '192.168.1.61',
        );

        assert.strictEqual(one.found, true);
        assert.strictEqual(two.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].comment.add.length, 2);
    });
});
