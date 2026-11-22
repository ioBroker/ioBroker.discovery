'use strict';

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const ipp = require(build('adapters', 'ipp.js'));
const mdns = require(build('methods', 'mdns.js'));

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function mdnsPrinter({ service = '_ipp._tcp', instance = 'Office Printer', target = 'printer.local', txt = ['txtvers=1', 'rp=ipp/print'] } = {}) {
    const serviceName = `${service}.local`;
    const instanceName = `${instance}.${service}.local`;
    return {
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            PTR: { name: serviceName, data: instanceName },
            SRV: { name: instanceName, data: { priority: 0, weight: 0, port: 631, target } },
            TXT: { name: instanceName, data: txt },
        },
    };
}

function detect(device, options, ip = '192.168.1.50') {
    return new Promise(resolve => ipp.detect(ip, device, options, (err, found, addr) => resolve({ err, found, addr })));
}

describe('ipp detection', () => {
    for (const service of ['_ipp._tcp', '_ipps._tcp']) {
        it(`proposes the shared ipp adapter for ${service}`, async () => {
            const options = freshOptions();
            const { err, found, addr } = await detect(mdnsPrinter({ service }), options);

            assert.strictEqual(err, null);
            assert.strictEqual(found, true);
            assert.strictEqual(addr, '192.168.1.50');
            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0].common.name, 'ipp');
            assert.deepStrictEqual(options.newInstances[0].native, {});
            assert.deepStrictEqual(options.newInstances[0].comment.add, ['Office Printer (192.168.1.50)']);
        });
    }

    it('collects multiple printer services in one proposal without changing native.printers', async () => {
        const options = freshOptions();
        const first = await detect(mdnsPrinter({ service: '_ipp._tcp', instance: 'Office' }), options);
        const second = await detect(mdnsPrinter({ service: '_ipps._tcp', instance: 'Label' }), options, '192.168.1.51');

        assert.strictEqual(first.found, true);
        assert.strictEqual(second.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].native, {});
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Office (192.168.1.50)', 'Label (192.168.1.51)']);
    });

    it('offers discoveries as additions to an existing shared adapter instance', async () => {
        const options = freshOptions([
            {
                _id: 'system.adapter.ipp.0',
                common: { name: 'ipp' },
                native: { printers: [{ id: 'existing', host: 'old-printer.local' }] },
            },
        ]);
        await detect(mdnsPrinter({ instance: 'Office' }), options);
        await detect(mdnsPrinter({ service: '_ipps._tcp', instance: 'Label' }), options, '192.168.1.51');

        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0]._id, 'system.adapter.ipp.0');
        assert.deepStrictEqual(options.newInstances[0].native, { printers: [{ id: 'existing', host: 'old-printer.local' }] });
        assert.deepStrictEqual(options.newInstances[0].comment.extended, ['Office (192.168.1.50)', 'Label (192.168.1.51)']);
    });

    it('rejects foreign, incomplete, and lookalike mDNS services', async () => {
        const foreign = mdnsPrinter();
        foreign._mdns.PTR = { name: '_http._tcp.local', data: 'Office._http._tcp.local' };
        foreign._mdns.SRV.name = 'Office._http._tcp.local';
        foreign._mdns.TXT.name = 'Office._http._tcp.local';

        const lookalike = mdnsPrinter();
        lookalike._mdns.PTR = { name: '_ipp-extra._tcp.local', data: 'Office._ipp-extra._tcp.local' };
        lookalike._mdns.SRV.name = 'Office._ipp-extra._tcp.local';
        lookalike._mdns.TXT.name = 'Office._ipp-extra._tcp.local';

        const missingSrv = mdnsPrinter();
        delete missingSrv._mdns.SRV;

        const missingResourcePath = mdnsPrinter({ txt: ['txtvers=1', 'ty=some other device'] });
        const mismatchedRecords = mdnsPrinter();
        const officeInstance = 'Office Printer._ipp._tcp.local';
        mismatchedRecords._mdns.SRV = {
            name: 'Other Printer._ipp._tcp.local',
            data: { target: 'other-printer.local' },
            namex: [officeInstance],
            datax: [{ target: '.' }],
        };
        mismatchedRecords._mdns.TXT = {
            name: 'Other Printer._ipp._tcp.local',
            data: ['rp=ipp/print'],
            namex: [officeInstance],
            datax: [['ty=not the IPP printer']],
        };

        for (const device of [
            foreign,
            lookalike,
            missingSrv,
            missingResourcePath,
            mismatchedRecords,
            { _type: 'mdns', _mdns: {} },
        ]) {
            const options = freshOptions();
            const { err, found } = await detect(device, options);
            assert.strictEqual(err, null);
            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        }
    });

    it('handles a length-prefixed TXT buffer and merged record values', async () => {
        const device = mdnsPrinter({ instance: 'Buffer Printer' });
        const strings = ['txtvers=1', 'rp=ipp/print'];
        device._mdns.PTR.datax = ['Other._ipp._tcp.local'];
        device._mdns.SRV.names = ['Buffer Printer._ipp._tcp.local'];
        device._mdns.SRV.dataa = [{ target: 'printer.local' }];
        device._mdns.TXT = {
            name: 'Buffer Printer._ipp._tcp.local',
            data: Buffer.concat(strings.map(value => Buffer.concat([Buffer.from([Buffer.byteLength(value)]), Buffer.from(value)]))),
        };

        const options = freshOptions();
        const { found } = await detect(device, options);
        assert.strictEqual(found, true);
    });

    it('asks the scanner to browse both registered IPP service types', () => {
        let scannerOptions;
        class FakeMdns {
            constructor(options) {
                scannerOptions = options;
            }
            on() {
                return this;
            }
            run(callback) {
                callback();
            }
            close() {}
        }

        const originalLoad = Module._load;
        Module._load = function (request, ...args) {
            return request === 'mdns-discovery' ? FakeMdns : originalLoad.call(this, request, ...args);
        };
        try {
            const context = {
                log: { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} },
                timeout: 10000,
                setTimeout: () => {},
                addDevice: () => {},
                done: () => {},
            };
            mdns.browse.call(context, context);
        } finally {
            Module._load = originalLoad;
        }

        assert.ok(scannerOptions.name.includes('_ipp._tcp.local'));
        assert.ok(scannerOptions.name.includes('_ipps._tcp.local'));
    });

    it('runs only for mDNS devices and leaves a watchdog timeout', () => {
        assert.deepStrictEqual(ipp.type, ['mdns']);
        assert.ok(ipp.timeout > 0);
    });
});
