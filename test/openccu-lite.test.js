'use strict';

/**
 * Tests for lib/openccu-lite, the probe that tells an openccu-lite system from a classic CCU.
 *
 * Local servers on free ports stand in for the systems - the real thing answers on 80 and 443,
 * which a test cannot bind, so the probe is pointed at an origin instead of an address.
 */

const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');

const lite = require(path.join('..', 'build', 'lib', 'openccu-lite.js'));
const selfsigned = require('./selfsigned.fixture');

/** What openccu-lite 1.2.0 answers on /api/meta/v1/version */
const VERSION = {
    api: 'meta',
    version: 1,
    format: 1,
    revision: 20,
    implementation: 'occulited 2acb0f55c78ba6047c842a80021d32ef07b37462',
    commit: '2acb0f55c78ba6047c842a80021d32ef07b37462',
    hmip: { keyserver_mode: 'KEYSERVER_LOCAL', device_keys: 0, offline_pairing: true },
    capabilities: {
        pairing: true,
        state: true,
        history: true,
        apis: { meta: 1, rpc: 1, system: 1, auth: 1 },
        transports: ['sse', 'websocket'],
        json_double: true,
    },
};

/** A server that answers every request with `handler(req, res)`; resolves to its origin */
function serve(handler, tls = false) {
    return new Promise((resolve, reject) => {
        const server = tls
            ? https.createServer({ key: selfsigned.key, cert: selfsigned.cert }, handler)
            : http.createServer(handler);
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, origin: `${tls ? 'https' : 'http'}://127.0.0.1:${port}`, port });
        });
    });
}

function json(body, status = 200) {
    return (req, res) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
}

function close(server) {
    return new Promise(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
    });
}

/** Runs the probe, and fails when the callback comes more than once */
function probe(address, timeout = 1000) {
    return new Promise((resolve, reject) => {
        let calls = 0;
        lite.probe(address, timeout, result => {
            calls++;
            if (calls > 1) {
                reject(new Error('callback called twice'));
            }
            setTimeout(() => resolve(result), 50);
        });
    });
}

/** A port nothing listens on */
function freePort() {
    return new Promise(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

describe('openccu-lite: the version answer', () => {
    it('is openccu-lite when the API says it is the metadata API', () => {
        assert.strictEqual(lite.isVersionAnswer(VERSION), true);
        assert.strictEqual(lite.isVersionAnswer({ api: 'meta' }), true);
    });

    it('is not for anything else', () => {
        assert.strictEqual(lite.isVersionAnswer(null), false);
        assert.strictEqual(lite.isVersionAnswer('meta'), false);
        assert.strictEqual(lite.isVersionAnswer(42), false);
        assert.strictEqual(lite.isVersionAnswer({}), false);
        assert.strictEqual(lite.isVersionAnswer({ api: 'other', version: 1 }), false);
    });

    it('reads the lite-rpc major, and nothing when the answer has none', () => {
        assert.strictEqual(lite.rpcApiVersion(VERSION), 1);
        assert.strictEqual(lite.rpcApiVersion({ api: 'meta', capabilities: { apis: { rpc: 2 } } }), 2);
        assert.strictEqual(lite.rpcApiVersion({ api: 'meta' }), undefined);
        assert.strictEqual(lite.rpcApiVersion({ api: 'meta', capabilities: {} }), undefined);
        assert.strictEqual(lite.rpcApiVersion({ api: 'meta', capabilities: { apis: { rpc: '1' } } }), undefined);
    });

    it('reads the interfaces the system names, and nothing from an answer without the list', () => {
        assert.deepStrictEqual(lite.interfacesOf({ api: 'meta', interfaces: ['BidCos-RF', 'HmIP-RF'] }), [
            'BidCos-RF',
            'HmIP-RF',
        ]);
        assert.deepStrictEqual(lite.interfacesOf({ api: 'meta', interfaces: [] }), []);
        assert.deepStrictEqual(lite.interfacesOf({ api: 'meta', interfaces: [42, '', null, 'HmIP-RF'] }), ['HmIP-RF']);
        assert.strictEqual(lite.interfacesOf(VERSION), undefined);
        assert.strictEqual(lite.interfacesOf({ api: 'meta', interfaces: 'HmIP-RF' }), undefined);
    });

    it('allows pairing unless the system says it is switched off', () => {
        assert.strictEqual(lite.pairingAllowed(VERSION), true);
        assert.strictEqual(lite.pairingAllowed({ api: 'meta' }), true);
        assert.strictEqual(lite.pairingAllowed({ api: 'meta', capabilities: { pairing: false } }), false);
    });

    it('knows the default ports of both schemes', () => {
        assert.strictEqual(lite.portOf(new URL('http://192.168.1.20/x')), 80);
        assert.strictEqual(lite.portOf(new URL('https://192.168.1.20/x')), 443);
        assert.strictEqual(lite.portOf(new URL('https://192.168.1.20:8443/x')), 8443);
    });
});

describe('openccu-lite: the probe', () => {
    it('finds a system that answers over plain HTTP', async () => {
        const paths = [];
        const { server, origin, port } = await serve((req, res) => {
            paths.push(req.url);
            json(VERSION)(req, res);
        });
        try {
            const result = await probe(origin);
            assert.deepStrictEqual(result, { url: origin, https: false, port, info: VERSION });
            assert.deepStrictEqual(paths, ['/api/meta/v1/version']);
        } finally {
            await close(server);
        }
    });

    it('follows the redirect to HTTPS and accepts the self-signed certificate', async () => {
        const tls = await serve(json(VERSION), true);
        const plain = await serve((req, res) => {
            res.writeHead(301, { Location: `${tls.origin}${req.url}` });
            res.end();
        });
        try {
            const result = await probe(`${plain.origin}/`);
            assert.deepStrictEqual(result, { url: tls.origin, https: true, port: tls.port, info: VERSION });
        } finally {
            await close(plain.server);
            await close(tls.server);
        }
    });

    it('asks the version path at the origin a redirect names, whatever path it carries', async () => {
        const paths = [];
        const { server, origin } = await serve((req, res) => {
            paths.push(req.url);
            if (req.url === '/api/meta/v1/version' && paths.length === 1) {
                res.writeHead(302, { Location: '/login.htm' });
                return res.end();
            }
            json(VERSION)(req, res);
        });
        try {
            const result = await probe(origin);
            assert.strictEqual(result.url, origin);
            assert.deepStrictEqual(paths, ['/api/meta/v1/version', '/api/meta/v1/version']);
        } finally {
            await close(server);
        }
    });

    it('follows one redirect, not two', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(307, { Location: '/api/meta/v1/version' });
            res.end();
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('takes a redirect without a Location for what it is - no version answer', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(301);
            res.end();
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('follows no redirect away from HTTP', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(301, { Location: 'ftp://127.0.0.1/' });
            res.end();
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('gives up on a Location that is no URL', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(301, { Location: 'http://[' });
            res.end();
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('is not fooled by a classic CCU - its WebUI answers the path with a 404 page', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<!DOCTYPE html><html><head><title>404 Not Found</title></head></html>');
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('is not fooled by a web server that answers every path with a page', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><title>HomeMatic</title></html>');
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('is not fooled by some other JSON API', async () => {
        const { server, origin } = await serve(json({ api: 'something', version: 1 }));
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('stops reading an answer far larger than a version answer', async () => {
        const { server, origin } = await serve((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write(`{"api":"meta","padding":"${'x'.repeat(70 * 1024)}`);
            res.end('"}');
        });
        try {
            assert.strictEqual(await probe(origin), null);
        } finally {
            await close(server);
        }
    });

    it('gives up after its timeout on a system that accepts and does not answer', async function () {
        this.timeout(3000);
        const { server, origin } = await serve(() => {});
        try {
            const started = Date.now();
            assert.strictEqual(await probe(origin, 200), null);
            assert.ok(Date.now() - started < 1500, 'the probe waited longer than its timeout');
        } finally {
            await close(server);
        }
    });

    it('the timeout covers the redirect as well', async function () {
        this.timeout(3000);
        const silent = await serve(() => {}, true);
        const plain = await serve((req, res) => {
            res.writeHead(308, { Location: `${silent.origin}/` });
            res.end();
        });
        try {
            const started = Date.now();
            assert.strictEqual(await probe(plain.origin, 300), null);
            assert.ok(Date.now() - started < 1500, 'the probe waited longer than its timeout');
        } finally {
            await close(plain.server);
            await close(silent.server);
        }
    });

    it('answers null for a port nothing listens on', async () => {
        const port = await freePort();
        assert.strictEqual(await probe(`http://127.0.0.1:${port}`), null);
    });

    it('asks a bare address on port 80', async () => {
        // nothing a test can bind listens on 80 of the loopback - the point is the address form
        assert.strictEqual(await probe('127.0.0.1', 500), null);
    });

    it('puts a bare IPv6 address in brackets', async () => {
        assert.strictEqual(await probe('::1', 500), null);
    });

    it('answers null for an origin that is no URL', async () => {
        assert.strictEqual(await probe('http://['), null);
    });

    it('can be called without a callback', async () => {
        const { server, origin } = await serve(json(VERSION));
        try {
            lite.probe(origin, 500, null);
            await new Promise(resolve => setTimeout(resolve, 200));
        } finally {
            await close(server);
        }
    });
});
