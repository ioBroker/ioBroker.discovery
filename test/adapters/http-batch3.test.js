'use strict';

/**
 * Tests for the third HTTP batch: agent-dvr, enigma2 and zigbee2mqtt.
 *
 * Every endpoint was read out of the respective adapter's own code:
 *   agent-dvr    /command/getStatus, the adapter reads `profiles` from it
 *   enigma2      /web/about, which the adapter uses as its own reachability check
 *   zigbee2mqtt  a WebSocket upgrade on /api, the adapter's default connection
 */

const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const agent = require(build('agent-dvr.js'));
const enigma2 = require(build('enigma2.js'));
const z2m = require(build('zigbee2mqtt.js'));

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
            const [status, body, type] = result;
            res.writeHead(status, { 'Content-Type': type || 'application/json' });
            res.end(typeof body === 'string' ? body : JSON.stringify(body));
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

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
        for (const [name, module] of Object.entries({ agent, enigma2, z2m })) {
            assert.ok(module.timeout > 1400, `${name} timeout ${module.timeout}`);
            assert.deepStrictEqual(module.type, ['ip'], name);
        }
    });
});

describe('agent-dvr detection', () => {
    it('recognises the status by its profile list', () => {
        assert.strictEqual(agent.isAgentStatus({ profiles: [] }), true);
        assert.strictEqual(agent.isAgentStatus({ profiles: 'not a list' }), false);
        assert.strictEqual(agent.isAgentStatus({ status: 'ok' }), false);
        assert.strictEqual(agent.isAgentStatus(null), false);
    });

    it('creates an instance from a real answer', async function () {
        this.timeout(5000);
        if (!(await portUsable(8090))) {
            return this.skip();
        }
        const server = await serveHttp(8090, url =>
            url === '/command/getStatus' ? [200, { profiles: [{ name: 'Home' }] }] : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(agent, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.serverIp, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.port, 8090);
        } finally {
            await close(server);
        }
    });
});

describe('enigma2 detection', () => {
    const ABOUT = '<?xml version="1.0"?><e2abouts><e2about><e2model>Vu+ Duo</e2model></e2about></e2abouts>';

    it('recognises the OpenWebif answer', () => {
        assert.strictEqual(enigma2.isEnigma2About(ABOUT), true);
        assert.strictEqual(enigma2.isEnigma2About('<html><body>hello</body></html>'), false);
        assert.strictEqual(enigma2.isEnigma2About(''), false);
    });

    it('creates an instance and asks for the credentials', async function () {
        this.timeout(5000);
        const server = await serveHttp(80, url => (url === '/web/about' ? [200, ABOUT, 'text/xml'] : null));
        const options = freshOptions();

        try {
            const { found } = await detect(enigma2, options);

            assert.strictEqual(found, true);
            // the adapter spells these with capitals and keeps the port as text
            assert.strictEqual(options.newInstances[0].native.IPAddress, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.Port, '80');
            assert.strictEqual(options.newInstances[0].comment.inputs.length, 2);
        } finally {
            await close(server);
        }
    });

    it('ignores an ordinary web server on port 80', async function () {
        this.timeout(5000);
        const server = await serveHttp(80, () => [200, '<html>hi</html>', 'text/html']);
        const options = freshOptions();

        try {
            const { found } = await detect(enigma2, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});

describe('zigbee2mqtt detection', () => {
    const UPGRADE =
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n';

    it('accepts only a real protocol switch', () => {
        assert.strictEqual(z2m.isWebSocketUpgrade(UPGRADE), true);
        // a web server that answers politely but does not speak WebSocket
        assert.strictEqual(z2m.isWebSocketUpgrade('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n'), false);
        assert.strictEqual(z2m.isWebSocketUpgrade('HTTP/1.1 400 Bad Request\r\n\r\n'), false);
        assert.strictEqual(z2m.isWebSocketUpgrade(''), false);
    });

    it('creates an instance when /api switches protocol', async function () {
        this.timeout(5000);
        if (!(await portUsable(8080))) {
            return this.skip();
        }
        const server = await serveTcp(8080, request =>
            request.startsWith('GET /api') && /upgrade:\s*websocket/i.test(request)
                ? UPGRADE
                : 'HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n',
        );
        const options = freshOptions();

        try {
            const { found } = await detect(z2m, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.wsServerIP, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.wsServerPort, 8080);
            // the adapter also links to the frontend on the same address
            assert.strictEqual(options.newInstances[0].native.webUIServer, '127.0.0.1');
        } finally {
            await close(server);
        }
    });

    it('ignores a plain web server on the same port', async function () {
        this.timeout(5000);
        if (!(await portUsable(8080))) {
            return this.skip();
        }
        const server = await serveTcp(
            8080,
            () => 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html>hi</html>',
        );
        const options = freshOptions();

        try {
            const { found } = await detect(z2m, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});
