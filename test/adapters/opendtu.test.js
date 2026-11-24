'use strict';

/**
 * Tests for the OpenDTU detection module. OpenDTU (tbnobody/OpenDTU, src/NetworkSettings.cpp,
 * handleMDNS()) announces `_opendtu._tcp` on port 80 under its host name - only when mDNS is
 * switched on in its network settings.
 *
 * The device below is what the mdns method hands over for a real OpenDTU v26.11.11 with the
 * default host name `OpenDTU`: the answer was captured on a live network and run through
 * mdns-discovery and the merge of main.ts. PTR, SRV and TXT are answers; the A record came as
 * an additional record and is therefore missing, and the merge turns the TXT buffer into an
 * object with numeric keys. The HTTP probe is replaced by a stub - no test touches the network.
 */

const assert = require('node:assert');
const path = require('node:path');

const opendtu = require(path.join('..', '..', 'build', 'lib', 'adapters', 'opendtu.js'));
const tools = require(path.join('..', '..', 'build', 'lib', 'tools.js'));

const IP = '192.168.20.57';
const REFLECTOR = '192.168.1.1';

// `/site.webmanifest` of OpenDTU (webapp/public/site.webmanifest), served without credentials
const manifest = JSON.stringify({
    name: 'OpenDTU',
    short_name: 'OpenDTU',
    display: 'standalone',
    orientation: 'portrait',
    icons: [{ src: '/favicon.png', sizes: '144x144', type: 'image/png' }],
});

const originalHttpGet = tools.httpGet;
let pages;
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

function txtObject(text) {
    const bytes = Buffer.concat([Buffer.from([text.length]), Buffer.from(text)]);
    return Object.fromEntries([...bytes].map((byte, index) => [String(index), byte]));
}

function opendtuDevice(addr = IP) {
    return {
        _addr: addr,
        _name: '_opendtu._tcp.local',
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            ip: addr,
            type: 'answer',
            name: '_opendtu._tcp.local',
            PTR: { name: '_opendtu._tcp.local', data: 'OpenDTU._opendtu._tcp.local' },
            SRV: {
                name: 'OpenDTU._opendtu._tcp.local',
                data: { priority: 0, weight: 0, port: 80, target: 'OpenDTU.local' },
            },
            TXT: { name: 'OpenDTU._opendtu._tcp.local', data: txtObject('git_hash=v26.11.11') },
        },
    };
}

function detect(device, options, ip = IP) {
    return new Promise(resolve => opendtu.detect(ip, device, options, (err, found) => resolve({ err, found })));
}

describe('opendtu detection', () => {
    beforeEach(() => {
        pages = { [`http://${IP}/site.webmanifest`]: manifest };
        probed = [];
        tools.httpGet = (link, timeout, callback) => {
            assert.strictEqual(callback, undefined, 'the module uses the promise form');
            assert.ok(timeout > 0 && timeout < opendtu.timeout, 'the probe must end before the watchdog');
            probed.push(link);
            const body = pages[link];
            return body ? Promise.resolve(body) : Promise.reject(new Error('ECONNREFUSED'));
        };
    });

    afterEach(() => {
        tools.httpGet = originalHttpGet;
    });

    it('proposes one instance per OpenDTU with its address', async () => {
        const options = freshOptions();
        const { err, found } = await detect(opendtuDevice(), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.deepStrictEqual(probed, [`http://${IP}/site.webmanifest`]);
        assert.strictEqual(options.newInstances.length, 1);
        const instance = options.newInstances[0];
        assert.strictEqual(instance._id, 'system.adapter.opendtu.0');
        assert.deepStrictEqual(instance.native, { webUIScheme: 'http', webUIServer: IP, webUIPort: 80 });
        assert.deepStrictEqual(instance.comment.add, ['OpenDTU', IP]);
    });

    it('proposes nothing when an mDNS reflector repeated the announcement from its own address', async () => {
        // a UniFi gateway answers http://192.168.1.1/site.webmanifest with a redirect
        const options = freshOptions();
        const { found } = await detect(opendtuDevice(REFLECTOR), options, REFLECTOR);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, [`http://${REFLECTOR}/site.webmanifest`]);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('proposes nothing when the address answers with another manifest', async () => {
        pages[`http://${IP}/site.webmanifest`] = JSON.stringify({ name: 'Home Assistant' });
        const options = freshOptions();
        const { found } = await detect(opendtuDevice(), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('skips an OpenDTU that already has an instance with its IP address, without asking it', async () => {
        const existing = {
            _id: 'system.adapter.opendtu.0',
            common: { name: 'opendtu' },
            native: { webUIScheme: 'http', webUIServer: IP, webUIPort: 80 },
        };
        const options = freshOptions([existing]);
        const { found } = await detect(opendtuDevice(), options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, []);
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

    it('gives up when the OpenDTU does not answer in time', async () => {
        tools.httpGet = () => new Promise(() => {});
        const options = freshOptions();
        const { found } = await detect(opendtuDevice(), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores other devices that only announce _http._tcp', async () => {
        const options = freshOptions();
        const other = {
            _addr: '192.168.20.10',
            _mdns: {
                PTR: { name: '_http._tcp.local', data: 'shellyplus1-abc._http._tcp.local' },
                SRV: { name: 'shellyplus1-abc._http._tcp.local', data: { port: 80, target: 'shellyplus1-abc.local' } },
            },
        };
        const { found } = await detect(other, options, '192.168.20.10');

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, []);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
