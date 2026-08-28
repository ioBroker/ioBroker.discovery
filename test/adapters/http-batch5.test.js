'use strict';

/**
 * Tests for blebox and fullybrowser.
 *
 * Endpoints and answer shapes out of the adapters' own code:
 *   blebox        /api/device/state, every device module reads device.deviceName/type/id
 *   fullybrowser  ?cmd=deviceInfo&type=json, the adapter's error path names
 *                 `statustext: "Please login"` for a missing remote admin password
 */

const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const blebox = require(build('blebox.js'));
const fully = require(build('fullybrowser.js'));

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

function detect(module, options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        module.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('module contract', () => {
    it('both modules leave the watchdog room', () => {
        for (const [name, module] of Object.entries({ blebox, fully })) {
            assert.ok(module.timeout > 1400, `${name} timeout ${module.timeout}`);
            assert.deepStrictEqual(module.type, ['ip'], name);
        }
    });
});

describe('blebox state parsing', () => {
    it('maps the reported type onto the value the adapter offers', () => {
        // the API reports camel case, the device table expects lower case
        const info = blebox.parseBleboxState(
            JSON.stringify({ device: { deviceName: 'Garage', type: 'switchBox', id: 'abc123' } }),
        );

        assert.deepStrictEqual(info, { name: 'Garage', type: 'switchbox', id: 'abc123' });
    });

    it('leaves the type empty rather than inventing one', () => {
        const info = blebox.parseBleboxState(
            JSON.stringify({ device: { deviceName: 'X', type: 'somethingNew', id: 'a' } }),
        );

        assert.strictEqual(info.type, '');
    });

    it('needs a name or an id, not just a type', () => {
        assert.strictEqual(blebox.parseBleboxState('{"device":{"type":"switchBox"}}'), null);
        assert.strictEqual(blebox.parseBleboxState('{"status":"ok"}'), null);
        assert.strictEqual(blebox.parseBleboxState('<html>hi</html>'), null);
        assert.strictEqual(blebox.parseBleboxState(null), null);
    });

    it('collects several boxes in one instance', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = await serveHttp(80, url =>
            url === '/api/device/state'
                ? [200, { device: { deviceName: 'Garage', type: 'shutterBox', id: 'a1' } }]
                : null,
        );
        const options = freshOptions();

        try {
            const first = await detect(blebox, options, '127.0.0.1');
            const second = await detect(blebox, options, '127.0.0.1');

            assert.strictEqual(first.found, true);
            assert.strictEqual(second.found, false, 'same address must not be added twice');
            assert.strictEqual(options.newInstances.length, 1);
            assert.deepStrictEqual(options.newInstances[0].native.devices, [
                {
                    dev_name: 'Garage',
                    smart_name: '',
                    dev_ip: '127.0.0.1',
                    dev_port: '80',
                    polling: '360',
                    dev_type: 'shutterbox',
                },
            ]);
        } finally {
            await close(server);
        }
    });
});

describe('fullybrowser answer parsing', () => {
    it('treats the login hint as proof of a tablet', () => {
        const info = fully.parseFullyAnswer('{"status":"Error","statustext":"Please login"}');

        assert.strictEqual(info.needsPassword, true);
    });

    it('reads the device name when no password is set', () => {
        const info = fully.parseFullyAnswer('{"status":"OK","deviceName":"Wall Tablet"}');

        assert.strictEqual(info.needsPassword, false);
        assert.strictEqual(info.name, 'Wall Tablet');
    });

    it('rejects any other error and any other JSON', () => {
        // an unrelated error says nothing about what is on the port
        assert.strictEqual(fully.parseFullyAnswer('{"status":"Error","statustext":"Unknown command"}'), null);
        assert.strictEqual(fully.parseFullyAnswer('{"result":"ok"}'), null);
        assert.strictEqual(fully.parseFullyAnswer('<html>hi</html>'), null);
        assert.strictEqual(fully.parseFullyAnswer(null), null);
    });

    it('fills the device table and asks for the password', async function () {
        this.timeout(5000);
        if (!(await portUsable(2323))) {
            return this.skip();
        }
        const server = await serveHttp(2323, () => [200, { status: 'Error', statustext: 'Please login' }]);
        const options = freshOptions();

        try {
            const { found } = await detect(fully, options);

            assert.strictEqual(found, true);
            assert.deepStrictEqual(options.newInstances[0].native.tableDevices, [
                {
                    enabled: true,
                    apiType: 'restapi',
                    name: '127.0.0.1',
                    restProtocol: 'http',
                    ip: '127.0.0.1',
                    restPort: 2323,
                },
            ]);
            assert.ok(options.newInstances[0].comment.inputs[0].name.includes('restPassword'));
        } finally {
            await close(server);
        }
    });
});
