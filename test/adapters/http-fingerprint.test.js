'use strict';

/**
 * Tests for the HTTP fingerprint modules (volumio, creality).
 *
 * Both probe a fixed port and have to tell their device apart from anything else that
 * happens to answer there. A local HTTP server stands in for the device, so the tests never
 * touch the network.
 */

const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const volumio = require(build('adapters', 'volumio.js'));
const creality = require(build('adapters', 'creality.js'));

const VOLUMIO_PORT = 3000;
const MOONRAKER_PORT = 7125;

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** Serve one canned answer on 127.0.0.1; `answer(path)` returns [status, body] or null */
function serve(port, answer) {
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

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

function detect(module, options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        module.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('module contract', () => {
    it('gives the watchdog more room than the probe needs', () => {
        // main.js arms its timer before calling detect(), so an equal value loses the race
        assert.ok(volumio.timeout > 1400, `volumio timeout ${volumio.timeout}`);
        assert.ok(creality.timeout > 1400, `creality timeout ${creality.timeout}`);
        assert.deepStrictEqual(volumio.type, ['ip']);
        assert.deepStrictEqual(creality.type, ['ip']);
    });
});

describe('volumio detection', () => {
    it('creates an instance for a player that answers getSystemInfo', async function () {
        this.timeout(5000);
        const server = await serve(VOLUMIO_PORT, url =>
            url === '/api/v1/getSystemInfo'
                ? [200, { id: 'abc', host: 'http://volumio.local', name: 'Kitchen', systemversion: '3.611', hardware: 'pi' }]
                : null,
        );
        const options = freshOptions();

        try {
            const { err, found } = await detect(volumio, options);

            assert.strictEqual(err, null);
            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.ok(options.newInstances[0].common.title.includes('Kitchen'));
            assert.ok(options.newInstances[0].comment.add[0].includes('3.611'));
        } finally {
            await close(server);
        }
    });

    it('ignores another service that answers with JSON on the same port', async function () {
        this.timeout(5000);
        const server = await serve(VOLUMIO_PORT, () => [200, { status: 'ok', service: 'something else' }]);
        const options = freshOptions();

        try {
            const { found } = await detect(volumio, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });

    it('reports once when the port answers with an error page', async function () {
        this.timeout(5000);
        const server = await serve(VOLUMIO_PORT, () => [500, '<html>error</html>']);
        const options = freshOptions();
        let calls = 0;

        try {
            await new Promise(resolve => {
                volumio.detect('127.0.0.1', {}, options, () => {
                    calls++;
                    resolve();
                });
                setTimeout(resolve, 2500);
            });
            // httpGet reports twice on a non-200 answer with a body - the module must not
            await new Promise(r => setTimeout(r, 300));
            assert.strictEqual(calls, 1);
        } finally {
            await close(server);
        }
    });

    it('reports not found when nothing listens', async function () {
        this.timeout(5000);
        const options = freshOptions();

        const { found } = await detect(volumio, options);

        assert.strictEqual(found, false);
    });

    it('does not propose a second instance for a configured player', async function () {
        this.timeout(5000);
        const server = await serve(VOLUMIO_PORT, url =>
            url === '/api/v1/getSystemInfo' ? [200, { name: 'Kitchen', systemversion: '3.611', hardware: 'pi' }] : null,
        );
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.volumio.0',
            common: { name: 'volumio' },
            native: { host: '127.0.0.1' },
        });

        try {
            const { found } = await detect(volumio, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});

describe('creality detection', () => {
    it('creates an instance for a printer running Moonraker', async function () {
        this.timeout(5000);
        const server = await serve(MOONRAKER_PORT, url =>
            url === '/printer/info'
                ? [200, { result: { state: 'ready', hostname: 'K1C', software_version: 'v0.12.0-276-g6a06a2a' } }]
                : null,
        );
        const options = freshOptions();

        try {
            const { err, found } = await detect(creality, options);

            assert.strictEqual(err, null);
            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.moonrakerPort, 7125);
            assert.ok(options.newInstances[0].common.title.includes('K1C'));
            assert.ok(options.newInstances[0].comment.add[0].includes('Klipper v0.12.0'));
        } finally {
            await close(server);
        }
    });

    it('ignores a JSON answer without the Moonraker shape', async function () {
        this.timeout(5000);
        const server = await serve(MOONRAKER_PORT, () => [200, { result: { state: 'ready' } }]);
        const options = freshOptions();

        try {
            const { found } = await detect(creality, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });

    it('survives a non-JSON answer', async function () {
        this.timeout(5000);
        const server = await serve(MOONRAKER_PORT, () => [200, 'not json at all']);
        const options = freshOptions();

        try {
            const { found } = await detect(creality, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});
