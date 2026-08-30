'use strict';

/**
 * Tests for the last three candidates: siegenia, iometer and playstation.
 *
 * Where each probe comes from:
 *   siegenia     main.js browses mDNS and keeps a device whose service type is called
 *                `siegenia` - that is `_siegenia._tcp`
 *   iometer      main.js opens an EventSource on http://<ip>/v1/status
 *   playstation  playactor-iobroker: formatDiscoveryMessage() builds the SRCH datagram,
 *                wakePortsByType gives 987 (PS4) and 9302 (PS5), parseMessage() reads the answer
 */

const assert = require('node:assert');
const dgram = require('node:dgram');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const siegenia = require(build('adapters', 'siegenia.js'));
const iometer = require(build('adapters', 'iometer.js'));
const playstation = require(build('adapters', 'playstation.js'));
const mdnsMethod = require(build('methods', 'mdns.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(module, device, options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        module.detect(ip, device, options, (err, found, addr) => resolve({ err, found, addr }));
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

const close = server => new Promise(resolve => server.close(resolve));

describe('module contract', () => {
    it('siegenia listens on mDNS, the other two ask a device', () => {
        assert.deepStrictEqual(siegenia.type, ['mdns']);
        assert.deepStrictEqual(iometer.type, ['ip']);
        assert.deepStrictEqual(playstation.type, ['ip']);
    });

    it('the two network probes leave the watchdog room', () => {
        assert.ok(iometer.timeout > 1500, `iometer timeout ${iometer.timeout}`);
        assert.ok(playstation.timeout > 2400, `playstation timeout ${playstation.timeout}`);
    });
});

describe('siegenia detection', () => {
    const mdnsDevice = name => ({
        _mdns: {
            PTR: { data: '_siegenia._tcp.local' },
            SRV: { name: `${name}._siegenia._tcp.local` },
        },
    });

    it('the mDNS method asks for the service type', () => {
        // the module can only ever see what the method queried for
        assert.ok(
            String(mdnsMethod.browse).includes('_siegenia._tcp') ||
                JSON.stringify(mdnsMethod).includes('_siegenia._tcp'),
            'the service type has to be in the query list',
        );
    });

    it('fills a row of the device table with the adapter own defaults', async () => {
        const options = freshOptions();

        const { found } = await detect(siegenia, mdnsDevice('Fenster'), options, '192.168.1.40');

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].native.devices, [
            { ip: '192.168.1.40', name: 'Fenster', user: 'user', password: '0000' },
        ]);
        // every device has its own PIN, so it is asked for
        assert.strictEqual(options.newInstances[0].comment.inputs.length, 2);
    });

    it('collects a second device in the same instance', async () => {
        const options = freshOptions();

        await detect(siegenia, mdnsDevice('Fenster'), options, '192.168.1.40');
        const second = await detect(siegenia, mdnsDevice('Lueftung'), options, '192.168.1.41');

        assert.strictEqual(second.found, false, 'no new proposal, it joins the first');
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].native.devices.length, 2);
    });

    it('ignores an mDNS device of another kind', async () => {
        const options = freshOptions();

        const { found } = await detect(
            siegenia,
            { _mdns: { PTR: { data: '_http._tcp.local' } } },
            options,
            '192.168.1.42',
        );

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('leaves a device that is already configured alone', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.siegenia.0',
            common: { name: 'siegenia' },
            native: { devices: [{ ip: '192.168.1.40', name: 'Fenster' }] },
        });

        const { found } = await detect(siegenia, mdnsDevice('Fenster'), options, '192.168.1.40');

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('iometer status stream', () => {
    const HEADERS =
        'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n';
    const EVENT = 'event: statusEvent\ndata: {"meter":{"number":"1ESY1161234567","status":"connected"}}\n\n';

    it('builds a request the head understands', () => {
        const request = iometer.statusRequest('192.168.1.50');

        assert.ok(request.startsWith('GET /v1/status HTTP/1.1'));
        assert.ok(request.includes('Host: 192.168.1.50'));
        assert.ok(request.includes('Accept: text/event-stream'));
    });

    it('recognises the stream by its content type', () => {
        assert.strictEqual(iometer.isStatusStream(HEADERS), true);
        // an ordinary web server on the same port
        assert.strictEqual(iometer.isStatusStream('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n'), false);
        assert.strictEqual(iometer.isStatusStream('HTTP/1.1 404 Not Found\r\n\r\n'), false);
        assert.strictEqual(iometer.isStatusStream(''), false);
    });

    it('picks the meter number out of the first event', () => {
        assert.strictEqual(iometer.meterNumber(HEADERS + EVENT), '1ESY1161234567');
        assert.strictEqual(iometer.meterNumber(HEADERS), null);
    });

    it('proposes the head with the meter it sits on', async function () {
        this.timeout(8000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = net.createServer(socket => {
            socket.on('data', request => {
                if (request.toString().startsWith('GET /v1/status')) {
                    socket.write(HEADERS);
                    socket.write(EVENT);
                    // and then nothing more - a stream stays open
                }
            });
            socket.on('error', () => {});
        });
        await new Promise((resolve, reject) => {
            server.on('error', reject);
            server.listen(80, '127.0.0.1', resolve);
        });
        const options = freshOptions();

        try {
            const { found } = await detect(iometer, {}, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.iometerIp, '127.0.0.1');
            assert.ok(options.newInstances[0].comment.add[0].includes('1ESY1161234567'));
        } finally {
            await close(server);
        }
    });
});

describe('playstation discovery protocol', () => {
    it('builds the datagram byte for byte as playactor does', () => {
        assert.strictEqual(
            playstation.searchMessage('00020020').toString(),
            'SRCH * HTTP/1.1\ndevice-discovery-protocol-version:00020020\n',
        );
        assert.strictEqual(
            playstation.searchMessage('00030010').toString(),
            'SRCH * HTTP/1.1\ndevice-discovery-protocol-version:00030010\n',
        );
    });

    it('reads a console in standby and one that is awake', () => {
        const standby = playstation.parseConsoleAnswer(
            'HTTP/1.1 620 Server Standby\nhost-id:1234567890AB\nhost-name:Wohnzimmer\nhost-type:PS5\n',
        );
        assert.deepStrictEqual(standby, {
            status: 'STANDBY',
            id: '1234567890AB',
            name: 'Wohnzimmer',
            type: 'PS5',
        });

        const awake = playstation.parseConsoleAnswer(
            'HTTP/1.1 200 Ok\nhost-id:CAFEBABE\nhost-name:PS4-2\nhost-type:PS4\n',
        );
        assert.strictEqual(awake.status, 'AWAKE');
    });

    it('refuses an answer that is not a console', () => {
        // no host id - some other service answering in something HTTP-shaped
        assert.strictEqual(playstation.parseConsoleAnswer('HTTP/1.1 200 OK\nContent-Type: text/html\n'), null);
        assert.strictEqual(playstation.parseConsoleAnswer('HTTP/1.1 404 Not Found\nhost-id:x\n'), null);
        assert.strictEqual(playstation.parseConsoleAnswer('SRCH * HTTP/1.1\n'), null, 'that is the question');
        assert.strictEqual(playstation.parseConsoleAnswer(''), null);
    });

    it('proposes the console with a row of the adapter table', async function () {
        this.timeout(8000);
        if (!(await portUsable(987, true))) {
            return this.skip();
        }
        const console5 = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        console5.on('message', (message, remote) => {
            if (!message.toString().startsWith('SRCH')) {
                return;
            }
            const reply = Buffer.from(
                'HTTP/1.1 620 Server Standby\nhost-id:1234567890AB\nhost-name:Wohnzimmer\n' +
                    'host-request-port:987\nhost-type:PS4\n',
            );
            console5.send(reply, 0, reply.length, remote.port, remote.address);
        });
        await new Promise(resolve => console5.bind(987, '127.0.0.1', resolve));
        const options = freshOptions();

        try {
            const { found } = await detect(playstation, {}, options);

            assert.strictEqual(found, true);
            assert.deepStrictEqual(options.newInstances[0].native.ps, [
                { active: true, ps4name: 'Wohnzimmer', ip: '127.0.0.1', interval: 5, icon: '', credential: '' },
            ]);
            assert.strictEqual(options.newInstances[0].comment.inputs[0].name, 'native.npsso');
        } finally {
            console5.close();
        }
    });

    it('stays quiet where no console answers', async function () {
        this.timeout(8000);
        const options = freshOptions();

        const { found } = await detect(playstation, {}, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
