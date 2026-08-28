'use strict';

/**
 * Tests for govee-smart, tapo, frigate and nspanel-lovelace-ui.
 *
 * Where the probe comes from:
 *   govee-smart          lib/govee-lan-client.js - multicast scan on 4001, answers on 4002
 *   tapo                 lib/utils/udpDiscovery.js - the 16 byte header on UDP 20002
 *   frigate              lib/eventHistory.js reads /api/config to build its camera objects
 *   nspanel-lovelace-ui  main.js calls `status 0` and its own Berry command GetDriverVersion
 */

const assert = require('node:assert');
const dgram = require('node:dgram');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const govee = require(build('govee-smart.js'));
const tapo = require(build('tapo.js'));
const frigate = require(build('frigate.js'));
const nspanel = require(build('nspanel-lovelace-ui.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(module, options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        module.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

function portUsable(port, udp) {
    return new Promise(resolve => {
        if (udp) {
            const probe = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            probe.once('error', () => resolve(false));
            probe.bind(port, () => probe.close(() => resolve(true)));
            return;
        }
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

function serveHttp(port, answer) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const result = answer(req.url);
            if (!result) {
                res.writeHead(404);
                return res.end('not found');
            }
            const [status, body] = result;
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(typeof body === 'string' ? body : JSON.stringify(body));
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

const close = server => new Promise(resolve => server.close(resolve));

describe('module contract', () => {
    it('every module leaves the watchdog room', () => {
        for (const [name, module] of Object.entries({ govee, tapo, frigate, nspanel })) {
            assert.ok(module.timeout > 1000, `${name} timeout ${module.timeout}`);
        }
    });

    it('the broadcast module runs once, the rest per address', () => {
        assert.deepStrictEqual(govee.type, ['once']);
        for (const [name, module] of Object.entries({ tapo, frigate, nspanel })) {
            assert.deepStrictEqual(module.type, ['ip'], name);
        }
    });
});

describe('govee-smart detection', () => {
    const scanAnswer = (device, sku) =>
        JSON.stringify({
            msg: { cmd: 'scan', data: { ip: '10.0.0.9', device, sku, bleVersionHard: '3.01.01' } },
        });

    it('reads a scan answer and takes the address from the sender', () => {
        const entry = govee.parseGoveeScan(scanAnswer('1F:2E:3D:4C', 'H6159'), '192.168.1.77');

        // the payload claims 10.0.0.9 - the adapter deliberately trusts the UDP source instead
        assert.deepStrictEqual(entry, { ip: '192.168.1.77', device: '1F:2E:3D:4C', sku: 'H6159' });
    });

    it('ignores anything that is not a scan answer', () => {
        assert.strictEqual(govee.parseGoveeScan(JSON.stringify({ msg: { cmd: 'devStatus', data: {} } }), '1.2.3.4'), null);
        assert.strictEqual(govee.parseGoveeScan(JSON.stringify({ msg: { cmd: 'scan', data: {} } }), '1.2.3.4'), null);
        assert.strictEqual(govee.parseGoveeScan('not json', '1.2.3.4'), null);
    });

    it('refuses implausibly long fields, as the adapter does', () => {
        assert.strictEqual(govee.parseGoveeScan(scanAnswer('x'.repeat(65), 'H6159'), '1.2.3.4'), null);
        assert.strictEqual(govee.parseGoveeScan(scanAnswer('mac', 'y'.repeat(25)), '1.2.3.4'), null);
    });

    it('proposes one instance for every lamp that answers', async function () {
        this.timeout(9000);
        if (!(await portUsable(4001, true)) || !(await portUsable(4002, true))) {
            return this.skip();
        }
        const options = freshOptions();

        // a stand-in lamp: listens for the scan and answers to port 4002 of the asker
        const lamp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        lamp.on('message', (message, remote) => {
            if (!message.toString().includes('"scan"')) {
                return;
            }
            const reply = Buffer.from(scanAnswer('1F:2E:3D:4C', 'H6159'));
            lamp.send(reply, 0, reply.length, 4002, remote.address);
        });
        await new Promise(resolve =>
            lamp.bind(4001, () => {
                try {
                    lamp.addMembership('239.255.255.250');
                } catch {
                    // no membership, the test skips below if nothing arrives
                }
                resolve();
            }),
        );

        try {
            const { found } = await detect(govee, options, '0.0.0.0');

            if (!found) {
                // no multicast loopback here - the parser checks above still cover the logic
                return this.skip();
            }
            assert.strictEqual(options.newInstances.length, 1);
            assert.ok(options.newInstances[0].comment.add[0].includes('H6159'));
            assert.strictEqual(options.newInstances[0].comment.inputs[0].name, 'native.apiKey');
        } finally {
            lamp.close();
        }
    });
});

describe('tapo detection', () => {
    const CRC_TABLE = (() => {
        const table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(buffer) {
        let c = 0xffffffff;
        for (let i = 0; i < buffer.length; i++) {
            c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
        }
        return (c ^ 0xffffffff) >>> 0;
    }

    function answerFor(result) {
        const payload = Buffer.from(JSON.stringify({ error_code: 0, result }), 'utf8');
        return Buffer.concat([Buffer.alloc(16), payload]);
    }

    it('builds the packet the device expects', () => {
        const query = tapo.discoveryQuery();

        assert.strictEqual(query[0], 2);
        assert.strictEqual(query.readUInt16BE(2), 1);
        assert.strictEqual(query.readUInt16BE(4), query.length - 16);
        assert.strictEqual(query[6], 33);

        const payload = JSON.parse(query.subarray(16).toString('utf8'));
        assert.ok(payload.params.rsa_key.startsWith('-----BEGIN PUBLIC KEY-----'));

        // the checksum covers the whole packet with the seed still in the checksum field
        const stored = query.readUInt32BE(12);
        const recomputed = Buffer.from(query);
        recomputed.writeUInt32BE(1516993677, 12);
        assert.strictEqual(crc32(recomputed), stored);
    });

    it('generates the key only once - it costs more than the probe', () => {
        assert.strictEqual(tapo.discoveryQuery(), tapo.discoveryQuery());
    });

    it('reads the device out of the answer', () => {
        const answer = tapo.parseTapoAnswer(
            answerFor({
                device_id: 'ABC',
                device_type: 'SMART.TAPOPLUG',
                device_model: 'P110(EU)',
                mac: 'AA-BB-CC-DD-EE-FF',
                mgt_encrypt_schm: { http_port: 80, lv: 2 },
            }),
        );

        assert.deepStrictEqual(answer, {
            model: 'P110(EU)',
            deviceType: 'SMART.TAPOPLUG',
            mac: 'AA-BB-CC-DD-EE-FF',
        });
    });

    it('ignores answers that name no device type', () => {
        assert.strictEqual(tapo.parseTapoAnswer(answerFor({ device_id: 'ABC' })), null);
        assert.strictEqual(tapo.parseTapoAnswer(Buffer.alloc(16)), null);
        assert.strictEqual(tapo.parseTapoAnswer(Buffer.concat([Buffer.alloc(16), Buffer.from('nope')])), null);
    });

    it('takes Tapo devices but leaves the Kasa line alone', () => {
        assert.strictEqual(tapo.isTapoDevice('SMART.TAPOPLUG'), true);
        assert.strictEqual(tapo.isTapoDevice('SMART.TAPOBULB'), true);
        assert.strictEqual(tapo.isTapoDevice('SMART.IPCAMERA'), true);
        // the same discovery answers for Kasa hardware, which this adapter does not drive
        assert.strictEqual(tapo.isTapoDevice('SMART.KASAPLUG'), false);
        assert.strictEqual(tapo.isTapoDevice(undefined), false);
    });

    it('proposes an instance and asks for the account', async function () {
        this.timeout(6000);
        if (!(await portUsable(20002, true))) {
            return this.skip();
        }
        const options = freshOptions();

        const plug = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        plug.on('message', (message, remote) => {
            if (message.length <= 16) {
                return;
            }
            const reply = answerFor({ device_type: 'SMART.TAPOPLUG', device_model: 'P110(EU)', mac: 'AA' });
            plug.send(reply, 0, reply.length, remote.port, remote.address);
        });
        await new Promise(resolve => plug.bind(20002, '127.0.0.1', resolve));

        try {
            const { found } = await detect(tapo, options);

            assert.strictEqual(found, true);
            assert.ok(options.newInstances[0].comment.add[0].includes('P110(EU)'));
            assert.deepStrictEqual(
                options.newInstances[0].comment.inputs.map(i => i.name),
                ['native.username', 'native.password'],
            );
        } finally {
            plug.close();
        }
    });

    it('stays quiet when nothing answers', async function () {
        this.timeout(6000);
        const options = freshOptions();

        const { found } = await detect(tapo, options, '127.0.0.1');

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('frigate detection', () => {
    const CONFIG = {
        mqtt: { host: '127.0.0.1', enabled: true },
        detectors: { cpu1: { type: 'cpu' } },
        cameras: { einfahrt: {}, garten: {} },
        version: '0.14.1',
    };

    it('recognises a Frigate configuration', () => {
        assert.deepStrictEqual(frigate.parseFrigateConfig(JSON.stringify(CONFIG)), {
            cameras: ['einfahrt', 'garten'],
            version: '0.14.1',
        });
    });

    it('is not fooled by any other /api/config', () => {
        // a JSON document with cameras but none of the sections Frigate is built around
        assert.strictEqual(frigate.parseFrigateConfig(JSON.stringify({ cameras: { a: {} } })), null);
        assert.strictEqual(frigate.parseFrigateConfig(JSON.stringify({ mqtt: {}, cameras: [] })), null);
        assert.strictEqual(frigate.parseFrigateConfig('<html>hi</html>'), null);
        assert.strictEqual(frigate.parseFrigateConfig(null), null);
    });

    it('proposes the instance in the shape the adapter expects', async function () {
        this.timeout(5000);
        if (!(await portUsable(5000))) {
            return this.skip();
        }
        const server = await serveHttp(5000, url => (url === '/api/config' ? [200, CONFIG] : null));
        const options = freshOptions();

        try {
            const { found } = await detect(frigate, options);

            assert.strictEqual(found, true);
            // host:port without a scheme - the adapter puts http:// in front itself
            assert.strictEqual(options.newInstances[0].native.friurl, '127.0.0.1:5000');
            assert.ok(options.newInstances[0].comment.add[0].includes('2 camera(s)'));
        } finally {
            await close(server);
        }
    });

    it('does not propose a Frigate that is already configured', async function () {
        this.timeout(5000);
        if (!(await portUsable(5000))) {
            return this.skip();
        }
        const server = await serveHttp(5000, url => (url === '/api/config' ? [200, CONFIG] : null));
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.frigate.0',
            common: { name: 'frigate' },
            native: { friurl: '127.0.0.1:5000' },
        });

        try {
            const { found } = await detect(frigate, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});

describe('nspanel-lovelace-ui detection', () => {
    const status0 = (name, hardware) => ({
        Status: { Module: 0, DeviceName: name, FriendlyName: [name], Topic: 'tasmota_1A2B3C' },
        StatusNET: { Hostname: 'tasmota-1A2B3C', IPAddress: '127.0.0.1', Mac: 'AA:BB:CC:DD:EE:FF' },
        StatusFWR: { Version: '14.2.0', Hardware: hardware },
    });

    it('reads the hardware and the name out of status 0', () => {
        const info = nspanel.parseStatus0(JSON.stringify(status0('NSPanel Flur', 'ESP32')));

        assert.strictEqual(info.isEsp32, true);
        assert.strictEqual(info.namedNsPanel, true);
        assert.strictEqual(info.name, 'NSPanel Flur');
        assert.strictEqual(info.mac, 'AA:BB:CC:DD:EE:FF');
    });

    it('sees an ESP8266 Tasmota for what it is', () => {
        const info = nspanel.parseStatus0(JSON.stringify(status0('Steckdose Küche', 'ESP8266EX')));

        assert.strictEqual(info.isEsp32, false);
        assert.strictEqual(info.namedNsPanel, false);
    });

    it('ignores anything that is not a Tasmota status', () => {
        assert.strictEqual(nspanel.parseStatus0('{"WARNING":"Need user=&password="}'), null);
        assert.strictEqual(nspanel.parseStatus0('<html>hi</html>'), null);
        assert.strictEqual(nspanel.parseStatus0(null), null);
    });

    it('recognises the answer of the adapter own Berry driver', () => {
        assert.strictEqual(nspanel.hasNluiDriver('{"nlui_driver_version":"4.3.4"}'), true);
        // a Tasmota without the driver does not know the command
        assert.strictEqual(nspanel.hasNluiDriver('{"Command":"Unknown"}'), false);
        assert.strictEqual(nspanel.hasNluiDriver('not json'), false);
        assert.strictEqual(nspanel.hasNluiDriver(null), false);
    });

    it('builds the table row and says how sure it is', () => {
        const info = nspanel.parseStatus0(JSON.stringify(status0('NSPanel Flur', 'ESP32')));

        const named = nspanel.describePanel('192.168.1.60', info, false);
        assert.deepStrictEqual(named.row, { topic: 'tasmota_1A2B3C', name: 'NSPanel Flur', ip: '192.168.1.60' });
        assert.ok(named.label.includes('please confirm'));

        // the Berry driver answered - no hedging then
        const confirmed = nspanel.describePanel('192.168.1.60', info, true);
        assert.strictEqual(confirmed.label, 'NSPanel NSPanel Flur (192.168.1.60)');
        assert.ok(!confirmed.label.includes('please confirm'));
    });

    it('falls back to the address when the panel has neither topic nor name', () => {
        const bare = nspanel.describePanel('192.168.1.60', { isEsp32: true, namedNsPanel: false }, true);

        assert.deepStrictEqual(bare.row, { topic: '192.168.1.60', name: '192.168.1.60', ip: '192.168.1.60' });
    });

    it('proposes a panel that names itself and marks it as unconfirmed', async function () {
        this.timeout(6000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url =>
            url.includes('status') ? [200, status0('NSPanel Flur', 'ESP32')] : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(nspanel, options);

            assert.strictEqual(found, true);
            assert.deepStrictEqual(options.newInstances[0].native.panels, [
                { topic: 'tasmota_1A2B3C', name: 'NSPanel Flur', ip: '127.0.0.1' },
            ]);
            assert.ok(options.newInstances[0].comment.add[0].includes('please confirm'));
        } finally {
            await close(server);
        }
    });

    it('takes an unnamed ESP32 Tasmota only when the driver answers', async function () {
        this.timeout(6000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url =>
            url.includes('GetDriverVersion')
                ? [200, { nlui_driver_version: '4.3.4' }]
                : [200, status0('Wandschalter', 'ESP32')],
        );
        const options = freshOptions();

        try {
            const { found } = await detect(nspanel, options);

            assert.strictEqual(found, true);
            assert.ok(!options.newInstances[0].comment.add[0].includes('please confirm'));
        } finally {
            await close(server);
        }
    });

    it('leaves an ordinary ESP32 Tasmota alone', async function () {
        this.timeout(6000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url =>
            url.includes('GetDriverVersion') ? [200, { Command: 'Unknown' }] : [200, status0('Wandschalter', 'ESP32')],
        );
        const options = freshOptions();

        try {
            const { found } = await detect(nspanel, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});
