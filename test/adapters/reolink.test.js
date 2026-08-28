'use strict';

/**
 * Tests for the Reolink detection.
 *
 * Endpoint out of the adapter's genUrl(): `<protocol>://<ip>/api.cgi?cmd=<command>` - note
 * the path is /api.cgi, not /cgi-bin/api.cgi. The camera answers an array of command
 * results; the adapter evaluates `error.rspCode` and `error.detail` from it.
 *
 * The camera ships a self-signed certificate, which is why this module needs the TLS option
 * that was added to tools.httpGet. The HTTPS test below is what proves that path works.
 */

const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');

const reolink = require(path.join('..', '..', 'build', 'lib', 'adapters', 'reolink.js'));
const selfsigned = require('../selfsigned.fixture');

const AUTH_ERROR = JSON.stringify([
    { cmd: 'GetDevInfo', code: 1, error: { detail: 'please login first', rspCode: -6 } },
]);
const DEV_INFO = JSON.stringify([
    { cmd: 'GetDevInfo', code: 0, value: { DevInfo: { model: 'RLC-810A', name: 'Driveway' } } },
]);

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function serve(secure, port, answer) {
    return new Promise((resolve, reject) => {
        const handler = (req, res) => {
            const body = answer(req.url);
            if (!body) {
                res.writeHead(404);
                return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
        };
        const server = secure
            ? https.createServer({ key: selfsigned.key, cert: selfsigned.cert }, handler)
            : http.createServer(handler);
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

function detect(options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        reolink.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('reolink answer parsing', () => {
    it('treats the login error as proof of a camera', () => {
        const info = reolink.parseReolinkAnswer(AUTH_ERROR);

        assert.strictEqual(info.needsAuth, true);
    });

    it('reads model and name when the call was allowed', () => {
        const info = reolink.parseReolinkAnswer(DEV_INFO);

        assert.strictEqual(info.needsAuth, false);
        assert.strictEqual(info.model, 'RLC-810A');
        assert.strictEqual(info.name, 'Driveway');
    });

    it('requires the command to be echoed back', () => {
        // some other service answering a JSON array is not a camera
        assert.strictEqual(reolink.parseReolinkAnswer('[{"cmd":"SomethingElse","code":0}]'), null);
        assert.strictEqual(reolink.parseReolinkAnswer('[]'), null);
        assert.strictEqual(reolink.parseReolinkAnswer('{"cmd":"GetDevInfo"}'), null, 'must be an array');
        assert.strictEqual(reolink.parseReolinkAnswer('<html>hi</html>'), null);
        assert.strictEqual(reolink.parseReolinkAnswer(null), null);
    });
});

describe('reolink detection', () => {
    it('leaves room for two probes in a row', () => {
        assert.ok(reolink.timeout > 2 * 1400, `timeout ${reolink.timeout}`);
        assert.deepStrictEqual(reolink.type, ['ip']);
    });

    it('reaches a camera over https despite its self-signed certificate', async function () {
        this.timeout(8000);
        if (!(await portUsable(443))) {
            return this.skip();
        }
        const server = await serve(true, 443, url => (url.startsWith('/api.cgi?cmd=GetDevInfo') ? DEV_INFO : null));
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.cameraProtocol, 'https');
            assert.strictEqual(options.newInstances[0].native.sslvalid, false);
            assert.ok(options.newInstances[0].common.title.includes('Driveway'));
        } finally {
            await close(server);
        }
    });

    it('falls back to http and records that protocol', async function () {
        this.timeout(8000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serve(false, 80, url => (url.startsWith('/api.cgi?cmd=GetDevInfo') ? AUTH_ERROR : null));
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.cameraProtocol, 'http');
            // the camera says nothing useful without an account
            assert.strictEqual(options.newInstances[0].comment.inputs.length, 2);
        } finally {
            await close(server);
        }
    });

    it('ignores a web server that is not a camera', async function () {
        this.timeout(8000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serve(false, 80, () => '{"status":"ok"}');
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});
