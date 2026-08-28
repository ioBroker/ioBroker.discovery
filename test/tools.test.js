'use strict';

/**
 * Tests for the shared helpers in lib/tools.
 *
 * The focus is httpGet's options form, which was added so that a probe can reach a device
 * with a self-signed certificate. The plain-number form has about forty callers, so the
 * first test here is the one that guards it against regressing.
 */

const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');

const tools = require(path.join('..', 'build', 'lib', 'tools.js'));
const selfsigned = require('./selfsigned.fixture');

function servePlain(port, body) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

function serveTls(port, body) {
    return new Promise((resolve, reject) => {
        const server = https.createServer({ key: selfsigned.key, cert: selfsigned.cert }, (req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
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

function get(link, second) {
    return new Promise(resolve => {
        tools.httpGet(link, second, (err, data) => resolve({ err, data }));
    });
}

describe('tools.httpGet', () => {
    const PORT = 8099;
    const BODY = '{"hello":"world"}';

    it('keeps working with a plain timeout - the form every caller uses', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        const server = await servePlain(PORT, BODY);

        try {
            const { err, data } = await get(`http://127.0.0.1:${PORT}/`, 1000);

            assert.strictEqual(err, null);
            assert.strictEqual(data, BODY);
        } finally {
            await close(server);
        }
    });

    it('takes the timeout out of an options object just the same', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        const server = await servePlain(PORT, BODY);

        try {
            const { err, data } = await get(`http://127.0.0.1:${PORT}/`, { timeout: 1000 });

            assert.strictEqual(err, null);
            assert.strictEqual(data, BODY);
        } finally {
            await close(server);
        }
    });

    it('refuses an untrusted certificate by default', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        const server = await serveTls(PORT, BODY);

        try {
            const { err, data } = await get(`https://127.0.0.1:${PORT}/`, { timeout: 1000 });

            // the certificate is self-signed, so the request must not silently succeed
            assert.ok(err, 'expected a certificate error');
            assert.strictEqual(data, null);
        } finally {
            await close(server);
        }
    });

    it('reaches the device when the certificate check is switched off', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        const server = await serveTls(PORT, BODY);

        try {
            const { err, data } = await get(`https://127.0.0.1:${PORT}/`, {
                timeout: 1000,
                rejectUnauthorized: false,
            });

            assert.strictEqual(err, null);
            assert.strictEqual(data, BODY);
        } finally {
            await close(server);
        }
    });

    it('still returns a promise when no callback is given', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        const server = await servePlain(PORT, BODY);

        try {
            assert.strictEqual(await tools.httpGet(`http://127.0.0.1:${PORT}/`, 1000), BODY);
        } finally {
            await close(server);
        }
    });
});
