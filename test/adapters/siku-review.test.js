'use strict';

/** Regression tests from the manual review: every failure path completes exactly once. */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const dgram = require('node:dgram');
const siku = require('../../build/lib/adapters/siku.js');

class ReviewSocket extends EventEmitter {
    bind() {
        queueMicrotask(() => this.emit('listening'));
    }
    setBroadcast() {}
    send(_message, _port, _host, callback) {
        callback(null);
    }
    close() {
        this.closed = true;
    }
}

async function assertSingleCompletion(socket) {
    const create = dgram.createSocket;
    let calls = 0;
    let resolve;
    const completed = new Promise(done => {
        resolve = done;
    });
    const settings = {
        newInstances: [],
        existingInstances: [],
        language: 'en',
        enums: null,
        log: { debug() {}, info() {}, warn() {}, error() {} },
    };
    dgram.createSocket = () => socket;
    try {
        assert.doesNotThrow(() =>
            siku.detect('255.255.255.255', {}, settings, (error, found) => {
                calls++;
                assert.equal(error, null);
                assert.equal(found, false);
                resolve();
            }),
        );
        await completed;
        socket.emit('error', new Error('late socket error'));
        await new Promise(done => setImmediate(done));
        assert.equal(calls, 1, 'error paths must not call the discovery core twice');
        assert.equal(socket.closed, true);
        assert.equal(settings.newInstances.length, 0);
    } finally {
        dgram.createSocket = create;
    }
}

describe('SIKU review regressions', function () {
    this.timeout(4000);
    it('recognizes renamed existing instances by their stable object ID', () => {
        const original = dgram.createSocket;
        const settings = {
            newInstances: [],
            existingInstances: [
                { _id: 'system.adapter.siku.3', common: { name: 'Custom ventilation label' }, native: { devices: [] } },
            ],
            log: { debug() {} },
        };
        const snapshot = JSON.stringify(settings.existingInstances);
        let calls = 0;
        dgram.createSocket = () => {
            throw new Error('must not probe an existing siku instance');
        };
        try {
            assert.doesNotThrow(() =>
                siku.detect('255.255.255.255', {}, settings, (error, found) => {
                    calls++;
                    assert.equal(error, null);
                    assert.equal(found, false);
                }),
            );
            assert.equal(calls, 1);
            assert.equal(settings.newInstances.length, 0);
            assert.equal(JSON.stringify(settings.existingInstances), snapshot);
        } finally {
            dgram.createSocket = original;
        }
    });
    it('cleans up synchronous bind failures without throwing into the discovery core', async () => {
        const socket = new ReviewSocket();
        socket.bind = () => {
            throw new Error('synchronous bind failure');
        };
        await assertSingleCompletion(socket);
    });
    it('handles synchronous broadcast and send failures exactly once', async () => {
        for (const method of ['setBroadcast', 'send']) {
            const socket = new ReviewSocket();
            socket[method] = () => {
                throw new Error(`synchronous ${method} failure`);
            };
            await assertSingleCompletion(socket);
        }
    });
    it('handles a send error callback followed by a socket error exactly once', async () => {
        const socket = new ReviewSocket();
        socket.send = (_message, _port, _host, callback) => {
            callback(new Error('send failed'));
            socket.emit('error', new Error('secondary send error'));
        };
        await assertSingleCompletion(socket);
    });
});
