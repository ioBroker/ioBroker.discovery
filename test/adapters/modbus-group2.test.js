'use strict';

/**
 * Tests for the second Modbus batch: sigenergy, solakon-one and sonnen-charger, plus the
 * input-register read they needed.
 *
 * Where the registers come from:
 *   sigenergy       lib/registers.js - inverter.modelType at 30500, serialNumber at 30515,
 *                   and its own SigenMicroScanner probes exactly that pair
 *   solakon-one     lib/registers.js - model_name 30000, serial_number 30016, mfg_id 30032
 *   sonnen-charger  ChargerController.js - readInputRegisters(990, 31), serial 0..9, model 10..19
 *
 * The device modules all sit on port 502, which an unprivileged process cannot bind. Those
 * tests skip; the reader and the fingerprint functions are tested on a high port and in
 * isolation, so the logic stays covered everywhere.
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const sigenergy = require(build('adapters', 'sigenergy.js'));
const solakon = require(build('adapters', 'solakon-one.js'));
const sonnen = require(build('adapters', 'sonnen-charger.js'));

const HIGH_PORT = 5503;

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
 * A Modbus TCP server that knows a set of blocks.
 *
 * @param blocks keyed `"<functionCode>:<unitId>:<address>"`, value is the register payload
 * @param port TCP port to listen on
 */
function modbusServer(blocks, port) {
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

                const payload = blocks[`${fn}:${unit}:${address}`];
                if (!payload) {
                    // exception answer, exactly what a real device sends for a bad request
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
 * Pad a string into a register block the way a device does - NUL bytes after the text.
 *
 * @param text the string the device holds
 * @param words how many registers the block is wide
 */
function stringBlock(text, words) {
    const block = Buffer.alloc(words * 2);
    block.write(text, 0, 'ascii');
    return block;
}

describe('module contract', () => {
    it('all three read over Modbus and leave the watchdog room', () => {
        for (const [name, module] of Object.entries({ sigenergy, solakon, sonnen })) {
            assert.deepStrictEqual(module.type, ['ip'], name);
            assert.ok(module.timeout > 1500, `${name} timeout ${module.timeout}`);
        }
    });
});

describe('tools.registerString', () => {
    it('cuts the text at the padding', () => {
        assert.strictEqual(tools.registerString(stringBlock('SigenStor EC 8.0', 15)), 'SigenStor EC 8.0');
        assert.strictEqual(tools.registerString(Buffer.from('no padding', 'ascii')), 'no padding');
    });

    it('returns null where there is no text', () => {
        assert.strictEqual(tools.registerString(Buffer.alloc(20)), null);
        assert.strictEqual(tools.registerString(Buffer.alloc(0)), null);
        assert.strictEqual(tools.registerString(null), null);
    });
});

describe('tools.readInputRegisters', () => {
    it('reads a block over function code 4', async function () {
        this.timeout(6000);
        if (!(await portUsable(HIGH_PORT))) {
            return this.skip();
        }
        const payload = stringBlock('HELLO', 4);
        const server = await modbusServer({ [`4:1:990`]: payload }, HIGH_PORT);

        try {
            const registers = await new Promise(resolve =>
                tools.readInputRegisters('127.0.0.1', HIGH_PORT, 1, 990, 4, 1500, (err, regs) =>
                    resolve(err ? null : regs),
                ),
            );

            assert.ok(registers, 'no answer');
            assert.strictEqual(tools.registerString(registers), 'HELLO');
        } finally {
            await close(server);
        }
    });

    it('does not take a holding-register answer for an input-register one', async function () {
        this.timeout(6000);
        if (!(await portUsable(HIGH_PORT))) {
            return this.skip();
        }
        // the server only knows function code 3 at this address
        const server = await modbusServer({ [`3:1:990`]: stringBlock('HELLO', 4) }, HIGH_PORT);

        try {
            const registers = await new Promise(resolve =>
                tools.readInputRegisters('127.0.0.1', HIGH_PORT, 1, 990, 4, 1500, (err, regs) =>
                    resolve(err ? null : regs),
                ),
            );

            assert.strictEqual(registers, null);
        } finally {
            await close(server);
        }
    });
});

describe('sigenergy model recognition', () => {
    it('accepts the names the family answers with', () => {
        assert.strictEqual(sigenergy.isSigenergy('SigenStor EC 8.0 TP'), true);
        // the adapter own scanner: "a SigenMicro responds with a model string beginning with SigenMicro"
        assert.strictEqual(sigenergy.isSigenergy('SigenMicro-1600'), true);
    });

    it('refuses everything else that answers register 30500', () => {
        assert.strictEqual(sigenergy.isSigenergy('SUN2000-10KTL-M1'), false);
        assert.strictEqual(sigenergy.isSigenergy(''), false);
        assert.strictEqual(sigenergy.isSigenergy(null), false);
    });

    it('proposes the inverter with its serial number', async function () {
        this.timeout(8000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer(
            {
                '3:1:30500': stringBlock('SigenStor EC 8.0 TP', 15),
                '3:1:30515': stringBlock('SG2024001234', 10),
            },
            502,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(sigenergy, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.tcpHost, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.inverterId, 1);
            assert.ok(options.newInstances[0].comment.add[0].includes('SG2024001234'));
        } finally {
            await close(server);
        }
    });

    it('leaves a Huawei on the same register alone', async function () {
        this.timeout(8000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer({ '3:1:30500': stringBlock('SUN2000-10KTL-M1', 15) }, 502);
        const options = freshOptions();

        try {
            const { found } = await detect(sigenergy, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});

describe('solakon-one recognition', () => {
    it('needs the name in the model or in the manufacturer', () => {
        assert.strictEqual(solakon.isSolakon('Solakon ONE 12K', null), true);
        assert.strictEqual(solakon.isSolakon('ONE-12K', 'Solakon GmbH'), true);
    });

    it('hands a Huawei over to the other adapter', () => {
        // 30000 is the same register both read - the name decides which one gets it
        assert.strictEqual(solakon.isSolakon('SUN2000-10KTL-M1', 'HUAWEI'), false);
        assert.strictEqual(solakon.isSolakon('SUN2000-10KTL-M1', 'Solakon'), false);
    });

    it('refuses a device that names neither', () => {
        assert.strictEqual(solakon.isSolakon('GW10K-ET', 'GoodWe'), false);
        assert.strictEqual(solakon.isSolakon(null, 'Solakon'), false);
    });

    it('proposes the inverter when the manufacturer confirms it', async function () {
        this.timeout(8000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer(
            {
                '3:1:30000': stringBlock('ONE-12K', 16),
                '3:1:30032': stringBlock('Solakon GmbH', 16),
            },
            502,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(solakon, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.slaveId, 1);
        } finally {
            await close(server);
        }
    });

    it('stays quiet for an inverter of a third make', async function () {
        this.timeout(8000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer(
            {
                '3:1:30000': stringBlock('GW10K-ET', 16),
                '3:1:30032': stringBlock('GoodWe', 16),
            },
            502,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(solakon, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});

describe('sonnen charger info block', () => {
    /**
     * Build the 31 register block the wallbox answers with.
     *
     * @param serial serial number, words 0..9
     * @param model model name, words 10..19
     * @param connectors number of connectors, word 30
     */
    function infoBlock(serial, model, connectors) {
        const block = Buffer.alloc(62);
        block.write(serial, 0, 'ascii');
        block.write(model, 20, 'ascii');
        block.writeInt16BE(connectors, 60);
        return block;
    }

    it('splits the block the way the adapter splits it', () => {
        const info = sonnen.parseChargerInfo(infoBlock('SN12345678', 'sonnen charger', 2));

        assert.deepStrictEqual(info, { serial: 'SN12345678', model: 'sonnen charger', connectors: 2 });
    });

    it('refuses a block that is not one', () => {
        assert.strictEqual(sonnen.parseChargerInfo(infoBlock('', 'sonnen charger', 2)), null, 'no serial');
        assert.strictEqual(sonnen.parseChargerInfo(infoBlock('SN1', '', 2)), null, 'no model');
        assert.strictEqual(sonnen.parseChargerInfo(infoBlock('SN1', 'charger', 0)), null, 'no connector');
        assert.strictEqual(sonnen.parseChargerInfo(infoBlock('SN1', 'charger', 99)), null, 'absurd count');
        assert.strictEqual(sonnen.parseChargerInfo(Buffer.alloc(20)), null, 'too short');
        assert.strictEqual(sonnen.parseChargerInfo(null), null);
    });

    it('proposes the wallbox with model, serial and connector count', async function () {
        this.timeout(8000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        // input registers, not holding registers - that is what the adapter reads
        const server = await modbusServer({ '4:1:990': infoBlock('SN12345678', 'sonnen charger', 2) }, 502);
        const options = freshOptions();

        try {
            const { found } = await detect(sonnen, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.serverIp, '127.0.0.1');
            assert.ok(options.newInstances[0].comment.add[0].includes('2 connectors'));
        } finally {
            await close(server);
        }
    });

    it('ignores a device that only knows holding registers', async function () {
        this.timeout(8000);
        if (!(await portUsable(502))) {
            return this.skip();
        }
        const server = await modbusServer({ '3:1:990': infoBlock('SN12345678', 'sonnen charger', 2) }, 502);
        const options = freshOptions();

        try {
            const { found } = await detect(sonnen, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});
