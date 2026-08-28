'use strict';

/**
 * Tests for the second HTTP batch: nut2, awtrix-light, evcc and pi-hole2.
 *
 * Every endpoint below was read out of the respective adapter's own client code. Local
 * servers stand in for the devices, so the tests never touch the network.
 */

const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const nut2 = require(build('nut2.js'));
const awtrix = require(build('awtrix-light.js'));
const evcc = require(build('evcc.js'));
const pihole = require(build('pi-hole2.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
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

/** Raw TCP server - needed where the probe speaks a line protocol or wants the status line */
function serveTcp(port, onData) {
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            socket.on('data', data => {
                const reply = onData(data.toString(), socket);
                if (reply) {
                    socket.write(reply);
                }
            });
            socket.on('error', () => {});
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

const close = server => new Promise(resolve => server.close(resolve));

/** true when a test server may bind this port here */
function portUsable(port) {
    return new Promise(resolve => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

function detect(module, options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        module.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('module contract', () => {
    it('every module leaves the watchdog room', () => {
        for (const [name, module] of Object.entries({ nut2, awtrix, evcc, pihole })) {
            assert.ok(module.timeout > 1400, `${name} timeout ${module.timeout}`);
            assert.deepStrictEqual(module.type, ['ip'], name);
        }
    });
});

describe('nut2 detection', () => {
    it('recognises a NUT server and proposes one instance for the whole server', async function () {
        this.timeout(5000);
        const server = await serveTcp(3493, request =>
            request.startsWith('LIST UPS') ? 'BEGIN LIST UPS\nUPS myups "Office UPS"\nEND LIST UPS\n' : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(nut2, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].common.name, 'nut2');
            // unlike nut.ts, nut2 takes the server, not a single UPS
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.port, 3493);
        } finally {
            await close(server);
        }
    });

    it('ignores a port that answers something else', async function () {
        this.timeout(5000);
        const server = await serveTcp(3493, () => 'SSH-2.0-OpenSSH_9.6\r\n');
        const options = freshOptions();

        try {
            const { found } = await detect(nut2, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});

describe('awtrix-light detection', () => {
    const STATS = { bat: 100, lux: 42, ram: 150000, uptime: 8123, wifi_signal: -55, version: '0.96' };

    it('creates an instance and names the firmware version', async function () {
        this.timeout(5000);
        const server = await serveHttp(80, url => (url === '/api/stats' ? [200, STATS] : null));
        const options = freshOptions();

        try {
            const { found } = await detect(awtrix, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.awtrixIp, '127.0.0.1');
            assert.ok(options.newInstances[0].comment.add[0].includes('0.96'));
        } finally {
            await close(server);
        }
    });

    it('needs several known fields, not just any JSON', () => {
        assert.strictEqual(awtrix.isAwtrixStats(STATS), true);
        assert.strictEqual(awtrix.isAwtrixStats({ bat: 100, somethingElse: true }), false);
        assert.strictEqual(awtrix.isAwtrixStats({}), false);
        assert.strictEqual(awtrix.isAwtrixStats(null), false);
    });
});

describe('evcc detection', () => {
    it('recognises the state by its loadpoint list', () => {
        assert.ok(evcc.evccState({ siteTitle: 'Home', loadpoints: [{ title: 'Garage' }] }));
        // depending on the version the state is wrapped in `result`
        assert.ok(evcc.evccState({ result: { loadpoints: [] } }));
    });

    it('rejects JSON without a loadpoint list', () => {
        assert.strictEqual(evcc.evccState({ status: 'ok' }), null);
        assert.strictEqual(evcc.evccState({ loadpoints: 'not a list' }), null);
        assert.strictEqual(evcc.evccState(null), null);
    });

    it('creates an instance from a real answer', async function () {
        this.timeout(5000);
        if (!(await portUsable(7070))) {
            return this.skip();
        }
        const server = await serveHttp(7070, url =>
            url === '/api/state' ? [200, { siteTitle: 'Home', loadpoints: [{ title: 'Garage' }] }] : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(evcc, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.ip, '127.0.0.1');
            // the adapter keeps the port as text
            assert.strictEqual(options.newInstances[0].native.port, '7070');
            assert.ok(options.newInstances[0].common.title.includes('Home'));
        } finally {
            await close(server);
        }
    });
});

describe('pi-hole2 detection', () => {
    const SESSION = JSON.stringify({ session: { valid: false, totp: false, sid: null, message: 'no password' } });

    it('reads the session answer even though it comes with 401', async function () {
        this.timeout(5000);
        // the v6 API answers an unauthenticated /api/auth with 401 *and* a body
        const server = await serveTcp(80, request =>
            request.startsWith('GET /api/auth')
                ? `HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: ${SESSION.length}\r\nConnection: close\r\n\r\n${SESSION}`
                : 'HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n',
        );
        const options = freshOptions();

        try {
            const { found } = await detect(pihole, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.address, 'http://127.0.0.1');
            // the adapter cannot read anything without a password, so we ask for one
            assert.strictEqual(options.newInstances[0].comment.inputs[0].name, 'native.password');
        } finally {
            await close(server);
        }
    });

    it('ignores another web server on port 80', async function () {
        this.timeout(5000);
        const server = await serveTcp(
            80,
            () => 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html>hello</html>',
        );
        const options = freshOptions();

        try {
            const { found } = await detect(pihole, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });

    it('recognises the answer shape on its own', () => {
        assert.strictEqual(pihole.isPiholeAnswer(`HTTP/1.1 401\r\n\r\n${SESSION}`), true);
        assert.strictEqual(pihole.isPiholeAnswer('HTTP/1.1 200 OK\r\n\r\n{"status":"ok"}'), false);
        assert.strictEqual(pihole.isPiholeAnswer(''), false);
    });
});
