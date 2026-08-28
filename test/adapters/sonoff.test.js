'use strict';

/**
 * Tests for the Tasmota detection (sonoff adapter).
 *
 * The endpoint could not be taken from the sonoff adapter - it only speaks MQTT. It is
 * verified against two other sources instead: Gladys discovers Tasmota devices over HTTP
 * with exactly `GET /cm?cmnd=Status`, and the Tasmota firmware's own decode-status.py reads
 * `Status.FriendlyName[0]` out of that answer.
 */

const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const sonoff = require(path.join('..', '..', 'build', 'lib', 'adapters', 'sonoff.js'));

const STATUS = {
    Status: {
        Module: 1,
        DeviceName: 'Tasmota',
        FriendlyName: ['Kitchen Light'],
        Topic: 'tasmota_A4CF12',
        Power: 0,
    },
};

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
        sonoff.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('tasmota status parsing', () => {
    it('reads name, topic and module out of the status', () => {
        assert.deepStrictEqual(sonoff.parseTasmotaStatus(JSON.stringify(STATUS)), {
            needsAuth: false,
            name: 'Kitchen Light',
            topic: 'tasmota_A4CF12',
            module: 1,
        });
    });

    it('treats the password warning as proof of a Tasmota', () => {
        // a protected device answers 200 with this instead of the status
        const info = sonoff.parseTasmotaStatus('{"WARNING":"Need user=&password="}');

        assert.strictEqual(info.needsAuth, true);
        assert.strictEqual(info.name, undefined);
    });

    it('rejects anything else', () => {
        assert.strictEqual(sonoff.parseTasmotaStatus('{"Status":{"Module":1}}'), null, 'no FriendlyName');
        assert.strictEqual(sonoff.parseTasmotaStatus('{"result":"ok"}'), null);
        assert.strictEqual(sonoff.parseTasmotaStatus('<html>hi</html>'), null);
        assert.strictEqual(sonoff.parseTasmotaStatus(''), null);
        assert.strictEqual(sonoff.parseTasmotaStatus(null), null);
    });
});

describe('sonoff detection', () => {
    it('leaves the watchdog room', () => {
        assert.ok(sonoff.timeout > 1400, `timeout ${sonoff.timeout}`);
        assert.deepStrictEqual(sonoff.type, ['ip']);
    });

    it('proposes the broker and names the device and its topic', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url => (url === '/cm?cmnd=Status' ? [200, STATUS] : null));
        const options = freshOptions();

        try {
            const { err, found } = await detect(options);

            assert.strictEqual(err, null);
            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].common.name, 'sonoff');
            const label = options.newInstances[0].comment.add[0];
            assert.ok(label.includes('Kitchen Light'));
            assert.ok(label.includes('tasmota_A4CF12'));
        } finally {
            await close(server);
        }
    });

    it('still reports a password protected device', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, () => [200, { WARNING: 'Need user=&password=' }]);
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            assert.strictEqual(found, true);
            assert.ok(options.newInstances[0].comment.add[0].includes('password protected'));
        } finally {
            await close(server);
        }
    });

    it('collects several devices in one broker instance', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url => (url === '/cm?cmnd=Status' ? [200, STATUS] : null));
        const options = freshOptions();

        try {
            const first = await detect(options, '127.0.0.1');
            const second = await detect(options, '127.0.0.1');

            assert.strictEqual(first.found, true);
            // the sonoff adapter is one broker for every Tasmota, so no second proposal
            assert.strictEqual(second.found, false);
            assert.strictEqual(options.newInstances.length, 1);
        } finally {
            await close(server);
        }
    });

    it('ignores an ordinary web server', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, () => [200, '<html>hello</html>']);
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
