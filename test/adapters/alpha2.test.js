'use strict';

/**
 * Tests for the Möhlenhoff Alpha 2 detection.
 *
 * The base station answers GET /data/static.xml without a login; its first <Device> carries
 * <ID>, <TYPE>EZRCTRL1</TYPE> and <NAME>. Its web server handles one connection at a time and
 * drops an answer half way when a second connection comes in. A local HTTP server on a free
 * port stands in for it, so the tests never touch the network. All values below are made up.
 */

const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const alpha2 = require(build('adapters', 'alpha2.js'));

function staticXml({ id = 'EZR012345', type = 'EZRCTRL1', name = id, firmware = '01.23' } = {}) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Devices>',
        '<Device>',
        `<ID>${id}</ID>`,
        `<TYPE>${type}</TYPE>`,
        `<NAME>${name}</NAME>`,
        '<ORIGIN>EXAMPLE01</ORIGIN>',
        '<DATETIME>2025-01-15T10:00:00</DATETIME>',
        `<VERS_SW_STM>${firmware}</VERS_SW_STM>`,
        '<VERS_SW_ETH>01.45</VERS_SW_ETH>',
        '<ACCOUNT>',
        '<USER>someone@example.com</USER>',
        '<SECRET>not-for-the-proposal</SECRET>',
        '</ACCOUNT>',
        '<HEATAREA nr="1">',
        '<HEATAREA_NAME>Room 1</HEATAREA_NAME>',
        '<T_ACTUAL>21.0</T_ACTUAL>',
        '</HEATAREA>',
        '<IODEVICE nr="1">',
        '<IODEVICE_TYPE>0</IODEVICE_TYPE>',
        '<IODEVICE_ID>1</IODEVICE_ID>',
        '</IODEVICE>',
        '</Device>',
        '</Devices>',
    ].join('\n');
}

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/**
 * Serve on a free port of 127.0.0.1. `handle(req, res, n)` answers the n-th request (1-based).
 * The returned object counts requests and the most connections open at the same time.
 */
function serve(handle) {
    return new Promise((resolve, reject) => {
        const stats = { requests: [], open: 0, maxOpen: 0 };
        const server = http.createServer((req, res) => {
            stats.requests.push({ method: req.method, url: req.url, connection: req.headers.connection });
            handle(req, res, stats.requests.length);
        });
        server.on('connection', socket => {
            stats.open++;
            stats.maxOpen = Math.max(stats.maxOpen, stats.open);
            socket.on('close', () => stats.open--);
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, stats }));
    });
}

function close(server) {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
}

function answerXml(res, body) {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(body);
}

/** Send the head of the answer and then break the connection, as the base station does */
function dropHalfWay(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/xml', 'Content-Length': 4000 });
    res.write('<?xml version="1.0" encoding="UTF-8"?>\n<Devices>\n<Device>\n');
    setTimeout(() => req.socket.destroy(), 20);
}

function probe(port, options) {
    return new Promise(resolve => {
        alpha2.probe('127.0.0.1', port, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

function freePort() {
    return new Promise(resolve => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
            const port = s.address().port;
            s.close(() => resolve(port));
        });
    });
}

function portUsable(port) {
    return new Promise(resolve => {
        const s = net.createServer();
        s.once('error', () => resolve(false));
        s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
    });
}

describe('alpha2 module contract', () => {
    it('gives the watchdog more room than two attempts and the pause between them', () => {
        // main.js arms its timer before calling detect(), so an equal value loses the race
        assert.ok(alpha2.timeout > 2 * 2000 + 500, `timeout ${alpha2.timeout}`);
        assert.deepStrictEqual(alpha2.type, ['ip']);
    });
});

describe('alpha2 static.xml parsing', () => {
    it('reads the base station out of static.xml', () => {
        assert.deepStrictEqual(alpha2.parseStaticXml(staticXml()), {
            id: 'EZR012345',
            type: 'EZRCTRL1',
            name: 'EZR012345',
            firmware: '01.23',
        });
    });

    it('takes nothing else out of the file', () => {
        const station = alpha2.parseStaticXml(staticXml());

        assert.deepStrictEqual(Object.keys(station).sort(), ['firmware', 'id', 'name', 'type']);
        assert.ok(!JSON.stringify(station).includes('example.com'));
        assert.ok(!JSON.stringify(station).includes('not-for-the-proposal'));
    });

    it('keeps the name somebody gave the base station', () => {
        const station = alpha2.parseStaticXml(staticXml({ name: 'Ground floor &amp; hall' }));

        assert.strictEqual(station.name, 'Ground floor & hall');
        assert.strictEqual(station.id, 'EZR012345');
    });

    it('reads the head of an answer that broke off after it', () => {
        const head = staticXml().split('<HEATAREA')[0];

        assert.strictEqual(alpha2.parseStaticXml(head).id, 'EZR012345');
    });

    it('needs the EZRCTRL type and an id', () => {
        assert.strictEqual(alpha2.parseStaticXml(staticXml({ type: 'SOMETHING' })), null);
        assert.strictEqual(alpha2.parseStaticXml(staticXml({ id: '' })), null);
        assert.strictEqual(alpha2.parseStaticXml('<Devices><Device><TYPE>EZRCTRL1</TYPE></Device></Devices>'), null);
    });

    it('ignores anything that is not a device list', () => {
        assert.strictEqual(alpha2.parseStaticXml('<html><body>EZRCTRL1</body></html>'), null);
        assert.strictEqual(alpha2.parseStaticXml('<ID>EZR012345</ID><TYPE>EZRCTRL1</TYPE>'), null);
        assert.strictEqual(alpha2.parseStaticXml('{"TYPE":"EZRCTRL1"}'), null);
        assert.strictEqual(alpha2.parseStaticXml(''), null);
        assert.strictEqual(alpha2.parseStaticXml(null), null);
        assert.strictEqual(alpha2.parseStaticXml(undefined), null);
    });
});

describe('alpha2 detection', () => {
    it('proposes an instance with the address of the base station', async function () {
        this.timeout(5000);
        const { server, port, stats } = await serve((req, res) => answerXml(res, staticXml()));
        const options = freshOptions();

        try {
            const { err, found, addr } = await probe(port, options);

            assert.strictEqual(err, null);
            assert.strictEqual(found, true);
            assert.strictEqual(addr, '127.0.0.1');
            assert.strictEqual(options.newInstances.length, 1);
            const instance = options.newInstances[0];
            assert.strictEqual(instance._id, 'system.adapter.alpha2.0');
            assert.strictEqual(instance.common.name, 'alpha2');
            assert.deepStrictEqual(instance.native, { host: '127.0.0.1' });
            assert.ok(instance.common.title.includes('EZR012345'));
            assert.deepStrictEqual(instance.comment.add, ['EZR012345, firmware 01.23', '127.0.0.1']);
            assert.deepStrictEqual(stats.requests, [{ method: 'GET', url: '/data/static.xml', connection: 'close' }]);
        } finally {
            await close(server);
        }
    });

    it('names a renamed base station together with its id', async function () {
        this.timeout(5000);
        const { server, port } = await serve((req, res) => answerXml(res, staticXml({ name: 'Ground floor' })));
        const options = freshOptions();

        try {
            await probe(port, options);

            assert.ok(options.newInstances[0].common.title.includes('Ground floor'));
            assert.strictEqual(options.newInstances[0].comment.add[0], 'Ground floor (EZR012345), firmware 01.23');
        } finally {
            await close(server);
        }
    });

    it('proposes a second instance for a second base station', async function () {
        this.timeout(5000);
        const { server, port } = await serve((req, res) => answerXml(res, staticXml()));
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.alpha2.0',
            common: { name: 'alpha2' },
            native: { host: '192.0.2.10' },
        });

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0]._id, 'system.adapter.alpha2.1');
        } finally {
            await close(server);
        }
    });

    it('leaves a base station alone that already has an instance', async function () {
        this.timeout(5000);
        const { server, port, stats } = await serve((req, res) => answerXml(res, staticXml()));
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.alpha2.0',
            common: { name: 'alpha2' },
            native: { host: '127.0.0.1' },
        });

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
            // the adapter is polling it - not a single request may take its connection
            assert.strictEqual(stats.requests.length, 0);
        } finally {
            await close(server);
        }
    });

    it('does not propose the same base station twice in one scan', async function () {
        this.timeout(5000);
        const { server, port } = await serve((req, res) => answerXml(res, staticXml()));
        const options = freshOptions();

        try {
            const first = await probe(port, options);
            const second = await probe(port, options);

            assert.strictEqual(first.found, true);
            assert.strictEqual(second.found, false);
            assert.strictEqual(options.newInstances.length, 1);
        } finally {
            await close(server);
        }
    });

    it('asks once more, one after the other, when the base station drops the answer', async function () {
        this.timeout(5000);
        const { server, port, stats } = await serve((req, res, n) =>
            n === 1 ? dropHalfWay(req, res) : answerXml(res, staticXml()),
        );
        const options = freshOptions();

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, true);
            assert.strictEqual(stats.requests.length, 2);
            assert.strictEqual(stats.maxOpen, 1, 'never two connections at the same time');
        } finally {
            await close(server);
        }
    });

    it('gives up after the second dropped answer', async function () {
        this.timeout(5000);
        const { server, port, stats } = await serve((req, res) => dropHalfWay(req, res));
        const options = freshOptions();

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, false);
            assert.strictEqual(stats.requests.length, 2);
            assert.strictEqual(stats.maxOpen, 1);
        } finally {
            await close(server);
        }
    });

    it('does not ask again when nothing answers in time', async function () {
        this.timeout(5000);
        const { server, port, stats } = await serve(() => {
            /* never answers */
        });
        const options = freshOptions();
        const started = Date.now();

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, false);
            assert.strictEqual(stats.requests.length, 1);
            assert.ok(Date.now() - started < alpha2.timeout, 'reports before the watchdog');
        } finally {
            await close(server);
        }
    });

    it('ignores another web server on the same port', async function () {
        this.timeout(5000);
        const { server, port } = await serve((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body>Welcome</body></html>');
        });
        const options = freshOptions();

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });

    it('reports once when the path is not there', async function () {
        this.timeout(5000);
        const { server, port } = await serve((req, res) => {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<html>not found</html>');
        });
        const options = freshOptions();
        let calls = 0;

        try {
            await new Promise(resolve => {
                alpha2.probe('127.0.0.1', port, options, () => {
                    calls++;
                    resolve();
                });
            });
            await new Promise(r => setTimeout(r, 300));

            assert.strictEqual(calls, 1);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });

    it('stops reading an answer far larger than any static.xml', async function () {
        this.timeout(5000);
        const { server, port } = await serve((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            // a valid head, followed by half a megabyte of filler
            res.write(staticXml().split('<HEATAREA')[0]);
            const chunk = `<!-- ${'x'.repeat(64 * 1024)} -->`;
            for (let i = 0; i < 8; i++) {
                res.write(chunk);
            }
            res.end('</Device></Devices>');
        });
        const options = freshOptions();

        try {
            const { found } = await probe(port, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });

    it('reports not found when nothing listens', async function () {
        this.timeout(5000);
        const options = freshOptions();

        const { found } = await probe(await freePort(), options);

        assert.strictEqual(found, false);
    });

    it('probes port 80 from detect()', async function () {
        this.timeout(5000);
        if (!(await portUsable(80))) {
            return this.skip();
        }
        const server = http.createServer((req, res) => answerXml(res, staticXml()));
        await new Promise(resolve => server.listen(80, '127.0.0.1', resolve));
        const options = freshOptions();

        try {
            const found = await new Promise(resolve =>
                alpha2.detect('127.0.0.1', { _addr: '127.0.0.1' }, options, (err, isFound) => resolve(isFound)),
            );

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
        } finally {
            await close(server);
        }
    });
});
