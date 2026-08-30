'use strict';

/**
 * Tests for the two probes that identify a device without a model register: victron-gx and
 * schwoerer-ventcube.
 *
 * Both are weaker than the rest of the Modbus modules, and the tests are written around
 * exactly that weakness - the cases that would fool a naive range or reachability check:
 *   victron-gx           a gateway that answers every unit id must not pass
 *   schwoerer-ventcube   a device that answers unknown registers with zeros must not pass
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const victron = require(build('victron-gx.js'));
const schwoerer = require(build('schwoerer-ventcube.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(module, options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        module.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

/**
 * A Modbus TCP server.
 *
 * @param answer called with the unit id and start address; return the payload or null for an
 *               exception answer
 * @param port TCP port to listen on
 */
function modbusServer(answer, port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            socket.on('data', request => {
                if (request.length < 12) {
                    return;
                }
                const transaction = request.readUInt16BE(0);
                const unit = request.readUInt8(6);
                const fn = request.readUInt8(7);
                const address = request.readUInt16BE(8);
                const count = request.readUInt16BE(10);

                const head = Buffer.alloc(7);
                head.writeUInt16BE(transaction, 0);
                head.writeUInt16BE(0, 2);
                head.writeUInt8(unit, 6);

                const payload = answer(unit, address, count);
                if (!payload) {
                    head.writeUInt16BE(3, 4);
                    return socket.write(Buffer.concat([head, Buffer.from([fn | 0x80, 0x02])]));
                }
                head.writeUInt16BE(3 + payload.length, 4);
                socket.write(Buffer.concat([head, Buffer.from([fn, payload.length]), payload]));
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

/**
 * Register bytes from a list of values.
 *
 * @param values one number per register
 */
function words(values) {
    const block = Buffer.alloc(values.length * 2);
    values.forEach((value, i) => block.writeUInt16BE(value, i * 2));
    return block;
}

describe('module contract', () => {
    it('both read over Modbus and budget for two reads', () => {
        for (const [name, module] of Object.entries({ victron, schwoerer })) {
            assert.deepStrictEqual(module.type, ['ip'], name);
            assert.ok(module.timeout > 2400, `${name} timeout ${module.timeout}`);
        }
    });
});

describe('victron-gx unit id control', () => {
    it('accepts a device that answers unit 100 and refuses unit 1', async function () {
        this.timeout(9000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        // a GX: ESS settings live on unit 100 only
        const server = await modbusServer(
            (unit, address) => (unit === 100 && address === 2902 ? words([1]) : null),
            502,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(victron, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.modbusPort, 502);
        } finally {
            await close(server);
        }
    });

    it('refuses a gateway that answers every unit id', async function () {
        this.timeout(9000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        // the case the control read exists for - a passthrough that ignores the unit
        const server = await modbusServer((unit, address) => (address === 2902 ? words([1]) : null), 502);
        const options = freshOptions();

        try {
            const { found } = await detect(victron, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });

    it('refuses a Modbus device without ESS settings', async function () {
        this.timeout(9000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer((unit, address) => (address === 30000 ? words([0]) : null), 502);
        const options = freshOptions();

        try {
            const { found } = await detect(victron, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});

describe('schwoerer-ventcube range check', () => {
    // operation mode 2, fan level 3, current level 2, throughput 55 %, no override
    const FIRST = [2, 3, 2, 55, 0];
    // time plan 2, no shock ventilation, 0 min left, unknown, heat pump state 5, unknown, NHR 1, fans 3 and 3
    const SECOND = [2, 0, 0, 0, 5, 0, 1, 3, 3];

    it('accepts values inside the declared ranges', () => {
        assert.strictEqual(schwoerer.blockInRange(words(FIRST), 100), true);
        assert.strictEqual(schwoerer.blockInRange(words(SECOND), 110), true);
    });

    it('refuses an all-zero answer - register 103 starts at 1', () => {
        assert.strictEqual(schwoerer.blockInRange(words([0, 0, 0, 0, 0]), 100), false);
    });

    it('refuses a value outside its range', () => {
        assert.strictEqual(schwoerer.blockInRange(words([9, 3, 2, 55, 0]), 100), false, 'operation mode > 4');
        assert.strictEqual(schwoerer.blockInRange(words([2, 3, 2, 200, 0]), 100), false, 'throughput > 100');
        assert.strictEqual(schwoerer.blockInRange(words([2, 3, 2, 55, 7]), 100), false, 'override > 1');
        assert.strictEqual(schwoerer.blockInRange(words([2, 0, 0, 0, 5, 0, 1, 3, 99]), 110), false, 'fan state > 6');
    });

    it('skips the two registers the parameter list does not declare', () => {
        // 113 and 115 are not in parameters.js, so any value has to pass
        const loose = [...SECOND];
        loose[3] = 65535;
        loose[5] = 65535;
        assert.strictEqual(schwoerer.blockInRange(words(loose), 110), true);
    });

    it('refuses an empty or missing answer', () => {
        assert.strictEqual(schwoerer.blockInRange(Buffer.alloc(0), 100), false);
        assert.strictEqual(schwoerer.blockInRange(null, 100), false);
    });

    it('proposes the unit and says how sure it is', async function () {
        this.timeout(9000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer((unit, address) => {
            if (address === 100) {
                return words(FIRST);
            }
            return address === 110 ? words(SECOND) : null;
        }, 502);
        const options = freshOptions();

        try {
            const { found } = await detect(schwoerer, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.server, '127.0.0.1');
            assert.match(options.newInstances[0].comment.text, /please confirm/);
        } finally {
            await close(server);
        }
    });

    it('refuses a device that answers both blocks with zeros', async function () {
        this.timeout(9000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer((unit, address, count) => words(new Array(count).fill(0)), 502);
        const options = freshOptions();

        try {
            const { found } = await detect(schwoerer, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });

    it('refuses a device that only knows the first block', async function () {
        this.timeout(9000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer((unit, address) => (address === 100 ? words(FIRST) : null), 502);
        const options = freshOptions();

        try {
            const { found } = await detect(schwoerer, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});
