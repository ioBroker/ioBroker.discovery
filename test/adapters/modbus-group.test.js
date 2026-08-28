'use strict';

/**
 * Tests for the Modbus group: the hand-rolled reader in lib/tools and the two Huawei
 * modules that sit on it.
 *
 * The register comes from the sun2000 adapter's own driver:
 * `{ id: 'info.model', desc: 'reg:30000, len:15' }`, which it logs as
 * `Identified a Huawei ${model}`. A minimal Modbus TCP server stands in for the inverter -
 * enough to answer function code 3 and to refuse everything else the way a real device does.
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const sun2000 = require(build('adapters', 'sun2000.js'));
const sun2000modbus = require(build('adapters', 'sun2000-modbus.js'));

const PORT = 5502;

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
 * A Modbus TCP server that answers reads of one register block on one unit id.
 *
 * @param unitId the unit that answers; anything else gets exception 0x0b
 * @param start first register it knows
 * @param payload the register bytes to hand out
 */
function modbusServer({ unitId = 1, start = 30000, payload = Buffer.alloc(0), port = PORT } = {}) {
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

                const head = Buffer.alloc(7);
                head.writeUInt16BE(transaction, 0);
                head.writeUInt16BE(0, 2);
                head.writeUInt8(unit, 6);

                if (unit !== unitId || fn !== 3 || address !== start) {
                    // exception answer, exactly what a real device sends for a bad request
                    head.writeUInt16BE(3, 4);
                    return socket.write(Buffer.concat([head, Buffer.from([fn | 0x80, 0x0b])]));
                }
                head.writeUInt16BE(3 + payload.length, 4);
                socket.write(Buffer.concat([head, Buffer.from([3, payload.length]), payload]));
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

/** the model string the way a SUN2000 pads it: NUL filled to the register length */
function modelPayload(name, words = 8) {
    const buffer = Buffer.alloc(words * 2, 0);
    buffer.write(name, 0, 'ascii');
    return buffer;
}

describe('tools.readHoldingRegisters', () => {
    it('reads a register block from a Modbus device', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        const payload = modelPayload('SUN2000-10KTL-M1');
        const server = await modbusServer({ payload });

        try {
            const registers = await new Promise(resolve => {
                tools.readHoldingRegisters('127.0.0.1', PORT, 1, 30000, 8, 1200, (err, regs) => resolve(regs));
            });

            assert.ok(registers, 'expected register bytes');
            assert.strictEqual(registers.length, 16);
            assert.strictEqual(registers.toString('ascii').replace(/\0+$/, ''), 'SUN2000-10KTL-M1');
        } finally {
            await close(server);
        }
    });

    it('reports nothing for an exception answer', async function () {
        this.timeout(5000);
        if (!(await portUsable(PORT))) {
            return this.skip();
        }
        // the device speaks Modbus but does not know this register
        const server = await modbusServer({ start: 40000 });

        try {
            const registers = await new Promise(resolve => {
                tools.readHoldingRegisters('127.0.0.1', PORT, 1, 30000, 8, 1200, (err, regs) => resolve(regs));
            });

            assert.strictEqual(registers, null);
        } finally {
            await close(server);
        }
    });

    it('reports nothing when nothing listens', async function () {
        this.timeout(5000);

        const registers = await new Promise(resolve => {
            tools.readHoldingRegisters('127.0.0.1', 5599, 1, 30000, 8, 800, (err, regs) => resolve(regs));
        });

        assert.strictEqual(registers, null);
    });
});

describe('sun2000 model recognition', () => {
    it('reads the padded model string', () => {
        assert.strictEqual(sun2000.readModelName(modelPayload('SUN2000-10KTL-M1')), 'SUN2000-10KTL-M1');
    });

    it('rejects binary that is not a name', () => {
        assert.strictEqual(sun2000.readModelName(Buffer.from([0x00, 0x01, 0xff, 0xfe])), null);
        assert.strictEqual(sun2000.readModelName(Buffer.alloc(0)), null);
        assert.strictEqual(sun2000.readModelName(null), null);
    });

    it('accepts only a Huawei model name', () => {
        assert.strictEqual(sun2000.isSun2000('SUN2000-10KTL-M1'), true);
        // another vendor's Modbus device answering register 30000 with something readable
        assert.strictEqual(sun2000.isSun2000('SENEC.Home'), false);
        assert.strictEqual(sun2000.isSun2000(null), false);
    });
});

describe('Huawei detection', () => {
    it('both modules leave room for a probe per unit id', () => {
        for (const [name, module] of Object.entries({ sun2000, sun2000modbus })) {
            assert.ok(module.timeout > 2 * 1200, `${name} timeout ${module.timeout}`);
            assert.deepStrictEqual(module.type, ['ip'], name);
        }
    });

    it('finds an inverter and stores the unit id the way each adapter wants it', async function () {
        this.timeout(10000);
        // the modules probe the conventional Modbus port
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer({ port: 502, payload: modelPayload('SUN2000-10KTL-M1') });

        try {
            const a = freshOptions();
            const b = freshOptions();
            await new Promise(resolve => sun2000.detect('127.0.0.1', {}, a, resolve));
            await new Promise(resolve => sun2000modbus.detect('127.0.0.1', {}, b, resolve));

            assert.strictEqual(a.newInstances.length, 1);
            assert.strictEqual(b.newInstances.length, 1);
            assert.ok(a.newInstances[0].common.title.includes('SUN2000-10KTL-M1'));
            // sun2000 takes a comma separated list, sun2000-modbus a single number
            assert.strictEqual(a.newInstances[0].native.modbusIds, '1');
            assert.strictEqual(b.newInstances[0].native.modbusUnitId, 1);
        } finally {
            await close(server);
        }
    });

    it('stays quiet for a Modbus device that is not a Huawei', async function () {
        this.timeout(10000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer({ port: 502, payload: modelPayload('SENEC.Home') });

        try {
            const options = freshOptions();
            const found = await new Promise(resolve =>
                sun2000.detect('127.0.0.1', {}, options, (err, ok) => resolve(ok)),
            );

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});
