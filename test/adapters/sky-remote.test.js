'use strict';

/**
 * Tests for the sky-remote probe. A Sky box greets every connection with `SKY 000.001\n`
 * before the client sends anything, and the probe must find it from that greeting alone.
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const sky = require(path.join('..', '..', 'build', 'lib', 'adapters', 'sky-remote.js'));

const PORT = 49160;

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(options) {
    return new Promise(resolve => {
        sky.detect('127.0.0.1', {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

function portUsable(port) {
    return new Promise(resolve => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

/**
 * A server that writes the given chunks on connect and records what the client sends.
 *
 * @param chunks buffers written one after the other
 */
function greetingServer(chunks) {
    const received = [];
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            socket.on('data', d => received.push(d));
            socket.on('error', () => {});
            chunks.forEach((chunk, i) => setTimeout(() => socket.write(chunk), i * 20));
        });
        server.once('error', reject);
        server.listen(PORT, '127.0.0.1', () => resolve({ server, received }));
    });
}

const close = server => new Promise(resolve => server.close(resolve));

describe('sky-remote', () => {
    describe('judgeGreeting', () => {
        it('accepts the Sky greeting', () => {
            assert.strictEqual(sky.judgeGreeting(Buffer.from('SKY 000.001\n')), true);
        });
        it('waits while the greeting is incomplete', () => {
            assert.strictEqual(sky.judgeGreeting(Buffer.from('SK')), null);
            assert.strictEqual(sky.judgeGreeting(Buffer.from('SKY 000')), null);
        });
        it('rejects another banner early', () => {
            assert.strictEqual(sky.judgeGreeting(Buffer.from('RFB')), false);
            assert.strictEqual(sky.judgeGreeting(Buffer.from('RFB 003.008\n')), false);
        });
        it('rejects a malformed version', () => {
            assert.strictEqual(sky.judgeGreeting(Buffer.from('SKY 0a0.001\n')), false);
        });
    });

    it('budgets more than its own probe timer', () => {
        assert.deepStrictEqual(sky.type, ['ip']);
        assert.ok(sky.timeout > 1000);
    });

    describe('detect', () => {
        let ctx = null;
        afterEach(async () => {
            if (ctx) {
                await close(ctx.server);
                ctx = null;
            }
        });

        it('finds a box from a greeting sent in pieces, sends nothing, proposes host and port', async function () {
            this.timeout(5000);
            if (!(await portUsable(PORT))) {
                return this.skip();
            }
            ctx = await greetingServer([Buffer.from('SKY 00'), Buffer.from('0.001\n')]);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, true);
            assert.strictEqual(ctx.received.length, 0, 'the probe must not write to the box');
            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0].common.name, 'sky-remote');
            assert.deepStrictEqual(options.newInstances[0].native, { host: '127.0.0.1', port: PORT });
        });

        it('ignores a service on the port with another banner', async function () {
            this.timeout(5000);
            if (!(await portUsable(PORT))) {
                return this.skip();
            }
            ctx = await greetingServer([Buffer.from('RFB 003.008\n')]);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        });

        it('ignores a silent open port', async function () {
            this.timeout(5000);
            if (!(await portUsable(PORT))) {
                return this.skip();
            }
            ctx = await greetingServer([]);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, false);
        });

        it('does not propose a second instance for a box that already has one', async function () {
            this.timeout(5000);
            if (!(await portUsable(PORT))) {
                return this.skip();
            }
            ctx = await greetingServer([Buffer.from('SKY 000.001\n')]);
            const options = freshOptions();
            options.existingInstances.push({
                _id: 'system.adapter.sky-remote.0',
                common: { name: 'sky-remote' },
                native: { host: '127.0.0.1', port: PORT },
            });
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        });
    });
});
