'use strict';

/**
 * Tests for the fourth HTTP batch: dune-hd-remote, janitza-gridvis and autodarts.
 *
 * Endpoints out of the adapters' own code:
 *   dune-hd-remote   /cgi-bin/do?cmd=..., answer carries `command_status`
 *   janitza-gridvis  /rest/common/info/version/full.json, the adapter takes `value`
 *   autodarts        /api/state, the adapter reads `status`, `event` and `throws`
 */

const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const dune = require(build('dune-hd-remote.js'));
const gridvis = require(build('janitza-gridvis.js'));
const autodarts = require(build('autodarts.js'));

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
        for (const [name, module] of Object.entries({ dune, gridvis, autodarts })) {
            assert.ok(module.timeout > 1400, `${name} timeout ${module.timeout}`);
            assert.deepStrictEqual(module.type, ['ip'], name);
        }
    });
});

describe('dune-hd-remote detection', () => {
    const OK = '<?xml version="1.0"?><command_result><param name="command_status" value="ok"/></command_result>';

    it('recognises the command result', () => {
        assert.strictEqual(dune.isDuneAnswer(OK), true);
        // both markers are required - a page merely mentioning the word is not a player
        assert.strictEqual(dune.isDuneAnswer('<html>command_status</html>'), false);
        assert.strictEqual(dune.isDuneAnswer('<command_result/>'), false);
        assert.strictEqual(dune.isDuneAnswer(null), false);
    });

    it('creates an instance from a real answer', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url =>
            url.startsWith('/cgi-bin/do?cmd=status') ? [200, OK, 'text/xml'] : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(dune, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.playerIP, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.playerPort, 80);
        } finally {
            await close(server);
        }
    });
});

describe('janitza-gridvis detection', () => {
    it('reads the version out of the answer', () => {
        assert.strictEqual(gridvis.gridvisVersion('{"value":"7.5.3"}'), '7.5.3');
        assert.strictEqual(gridvis.gridvisVersion('{"version":"7.5.3"}'), undefined);
        assert.strictEqual(gridvis.gridvisVersion('<html>hi</html>'), undefined);
        assert.strictEqual(gridvis.gridvisVersion(null), undefined);
    });

    it('creates an instance and asks for the project name', async function () {
        this.timeout(5000);
        if (!(await portUsable(8080))) {
            return this.skip();
        }
        const server = await serveHttp(8080, url =>
            url === '/rest/common/info/version/full.json' ? [200, { value: '7.5.3' }] : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(gridvis, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.address, '127.0.0.1');
            assert.ok(options.newInstances[0].comment.add[0].includes('7.5.3'));
            // without a project the adapter reads no measurements
            assert.strictEqual(options.newInstances[0].comment.inputs[0].name, 'native.projectname');
        } finally {
            await close(server);
        }
    });

    it('ignores another service on the same port', async function () {
        this.timeout(5000);
        if (!(await portUsable(8080))) {
            return this.skip();
        }
        const server = await serveHttp(8080, () => [200, { status: 'ok' }]);
        const options = freshOptions();

        try {
            const { found } = await detect(gridvis, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});

describe('autodarts detection', () => {
    it('recognises the board state', () => {
        assert.strictEqual(autodarts.isBoardState({ status: 'Throw', throws: [] }), true);
        assert.strictEqual(autodarts.isBoardState({ status: 'Takeout', event: 'x' }), true);
        // a bare status is not enough - too many services report one
        assert.strictEqual(autodarts.isBoardState({ status: 'ok' }), false);
        assert.strictEqual(autodarts.isBoardState({ throws: [] }), false);
        assert.strictEqual(autodarts.isBoardState(null), false);
    });

    it('creates an instance from a real answer', async function () {
        this.timeout(5000);
        if (!(await portUsable(3180))) {
            return this.skip();
        }
        const server = await serveHttp(3180, url =>
            url === '/api/state' ? [200, { status: 'Throw', throws: [], event: 'dart' }] : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(autodarts, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.port, 3180);
        } finally {
            await close(server);
        }
    });
});
