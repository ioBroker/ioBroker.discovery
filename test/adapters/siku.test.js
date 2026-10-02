'use strict';

/**
 * SIKU/Oxxify discovery: read-only RV V2 broadcast, strict binary fingerprinting and
 * one multi-device adapter proposal. Fixtures use synthetic IDs, not household data.
 */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const dgram = require('node:dgram');
const path = require('node:path');
const siku = require(path.join('..', '..', 'build', 'lib', 'adapters', 'siku.js'));

const ID = 'ABCD0123456789EF';
const REQUEST = 'fdfd021044454641554c545f44455649434549440431313131017cb9b106';
const RESPONSE =
    'fdfd021041424344303132333435363738394546043131313106fe107c41424344303132333435363738394546fe02b90e00750b';
function options() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'de',
        log: { debug() {}, info() {}, warn() {}, error() {} },
    };
}

/** Independent fixture encoder; never use the production parser to construct its own inputs. */
function packet(
    id = ID,
    payload = Buffer.concat([Buffer.from([0xfe, 16, 0x7c]), Buffer.from(id), Buffer.from([0xfe, 2, 0xb9, 14, 0])]),
    functionCode = 6,
) {
    const frame = Buffer.concat([
        Buffer.from([0xfd, 0xfd, 2, 16]),
        Buffer.from(id),
        Buffer.from([4]),
        Buffer.from('1111'),
        Buffer.from([functionCode]),
        payload,
    ]);
    const sum = [...frame.subarray(2)].reduce((a, b) => a + b, 0) & 0xffff;
    return Buffer.concat([frame, Buffer.from([sum & 255, sum >> 8])]);
}

class FakeSocket extends EventEmitter {
    bind(port) {
        this.boundPort = port;
        queueMicrotask(() => this.emit('listening'));
    }
    setBroadcast(value) {
        this.broadcast = value;
    }
    send(message, port, ip, callback) {
        this.request = message;
        this.target = { port, ip };
        callback(null);
        this.reply?.(this);
    }
    close() {
        this.closed = true;
    }
}

/** Replace only socket creation; scan timers and callback semantics remain real. */
async function detectWithSocket(socket, settings = options(), ip = '255.255.255.255') {
    const original = dgram.createSocket;
    dgram.createSocket = config => {
        socket.config = config;
        return socket;
    };
    try {
        return await new Promise(resolve =>
            siku.detect(ip, {}, settings, (error, found, address) => resolve({ error, found, address })),
        );
    } finally {
        dgram.createSocket = original;
    }
}

describe('SIKU read-only discovery protocol', () => {
    it('uses the broadcast method and gives the probe time to finish before the watchdog', () => {
        assert.deepEqual(siku.type, ['udp']);
        assert.ok(siku.timeout > 1500);
    });
    it('builds exactly the documented default-PIN read request for ID and type', () => {
        assert.equal(siku.discoveryRequest().toString('hex'), REQUEST);
    });
    it('parses a complete synthetic binary fixture without UTF-8 conversion', () => {
        assert.equal(packet().toString('hex'), RESPONSE);
        assert.deepEqual(siku.parseResponse(packet(), '192.0.2.10'), {
            id: ID,
            host: '192.0.2.10',
            discoveredType: '0E00 (14)',
        });
    });
    it('accepts a zero-length response password and reversed parameter order', () => {
        // Real fans omit the echoed password and return type before ID.
        const original = packet(
            ID,
            Buffer.concat([Buffer.from([0xfe, 2, 0xb9, 14, 0]), Buffer.from([0xfe, 16, 0x7c]), Buffer.from(ID)]),
        );
        const withoutPassword = Buffer.concat([original.subarray(0, 20), Buffer.from([0]), original.subarray(25, -2)]);
        const sum = [...withoutPassword.subarray(2)].reduce((a, b) => a + b, 0) & 0xffff;
        const answer = Buffer.concat([withoutPassword, Buffer.from([sum & 255, sum >> 8])]);
        assert.deepEqual(siku.parseResponse(answer, '192.0.2.10'), {
            id: ID,
            host: '192.0.2.10',
            discoveredType: '0E00 (14)',
        });
    });
    it('rejects self echoes, writes, foreign frames and corrupt checksums', () => {
        for (const frame of [
            siku.discoveryRequest(),
            packet(ID, undefined, 2),
            Buffer.from('HTTP/1.1 200 OK'),
            Buffer.from('fdfd02', 'hex'),
        ]) {
            assert.equal(siku.parseResponse(frame, '192.0.2.10'), null);
        }
        const corrupt = packet();
        corrupt[corrupt.length - 1] ^= 1;
        assert.equal(siku.parseResponse(corrupt, '192.0.2.10'), null);
    });
    it('does not mask non-ASCII ID bytes into a valid fingerprint', () => {
        const answer = packet();
        answer[4] |= 0x80;
        const sum = [...answer.subarray(2, -2)].reduce((a, b) => a + b, 0) & 0xffff;
        answer.writeUInt16LE(sum, answer.length - 2);
        assert.equal(siku.parseResponse(answer, '192.0.2.10'), null);
        assert.equal(siku.parseResponse(packet(), 'not-an-ip'), null);
    });
    it('rejects every truncation and malformed length field without throwing', () => {
        const complete = packet();
        for (let n = 0; n < complete.length; n++) {
            assert.equal(siku.parseResponse(complete.subarray(0, n), '192.0.2.10'), null);
        }
        for (const payload of [
            Buffer.from([0xfe]),
            Buffer.from([0xff]),
            Buffer.from([0xfe, 200, 0x7c, 1]),
            Buffer.from([0xfd, 0x7c]),
        ]) {
            assert.equal(siku.parseResponse(packet(ID, payload), '192.0.2.10'), null);
        }
    });
    it('requires matching hexadecimal header and payload IDs and a device type', () => {
        const wrongId = Buffer.concat([
            Buffer.from([0xfe, 16, 0x7c]),
            Buffer.from('0000000000000000'),
            Buffer.from([0xb9, 14]),
        ]);
        assert.equal(siku.parseResponse(packet(ID, wrongId), '192.0.2.10'), null);
        assert.equal(siku.parseResponse(packet('NOT_A_DEVICE_ID!'), '192.0.2.10'), null);
        const noType = Buffer.concat([Buffer.from([0xfe, 16, 0x7c]), Buffer.from(ID)]);
        assert.equal(siku.parseResponse(packet(ID, noType), '192.0.2.10'), null);
    });
    it('understands page markers and rejects unsupported or non-response parameter data', () => {
        const payload = Buffer.concat([
            Buffer.from([0xff, 0, 0xfe, 16, 0x7c]),
            Buffer.from(ID),
            Buffer.from([0xff, 0, 0xfe, 2, 0xb9, 14, 0]),
        ]);
        assert.ok(siku.parseResponse(packet(ID, payload), '192.0.2.10'));
        for (const tail of [
            [0xfd, 0xb9],
            [0xfc, 2, 0xb9, 14],
        ]) {
            const invalid = Buffer.concat([Buffer.from([0xfe, 16, 0x7c]), Buffer.from(ID), Buffer.from(tail)]);
            assert.equal(siku.parseResponse(packet(ID, invalid), '192.0.2.10'), null);
        }
    });
});

describe('SIKU discovery proposals and lifecycle', function () {
    this.timeout(5000);
    it('aggregates three fans and duplicate replies into one instance; sends only a read', async () => {
        const settings = options();
        const socket = new FakeSocket();
        socket.reply = socket => {
            socket.emit('message', socket.request, { address: '192.0.2.1', port: 4000 });
            socket.emit('message', Buffer.from('garbage'), { address: '192.0.2.99', port: 4000 });
            for (const [n, id] of [ID, 'ABCD0123456789E0', 'ABCD0123456789E1', ID].entries()) {
                socket.emit('message', packet(id), { address: `192.0.2.${10 + n}`, port: 4000 });
            }
        };
        const result = await detectWithSocket(socket, settings);
        assert.equal(result.found, true);
        assert.equal(result.error, null);
        assert.equal(settings.newInstances.length, 1);
        const instance = settings.newInstances[0];
        assert.equal(instance._id, 'system.adapter.siku.0');
        assert.equal(instance.common.name, 'siku');
        assert.equal(instance.native.devices.length, 3);
        assert.equal(new Set(instance.native.devices.map(row => row.id)).size, 3);
        assert.ok(instance.native.devices.every(row => row.enabled && !('password' in row)));
        assert.deepEqual(instance.native.devicePasswords, []);
        assert.equal(instance.native.pollIntervalSec, 30);
        assert.equal(instance.native.timeCheckIntervalHours, 24);
        assert.equal(instance.native.timeSyncThresholdSec, 10);
        assert.equal(instance.native.discoveryBroadcastAddress, '255.255.255.255');
        assert.equal(socket.request.toString('hex'), REQUEST);
        assert.equal(socket.boundPort, 4000);
        assert.equal(socket.broadcast, true);
        assert.deepEqual(socket.target, { port: 4000, ip: '255.255.255.255' });
        assert.equal(socket.config.reuseAddr, false);
        assert.equal(socket.closed, true);
    });
    it('leaves an installed siku instance untouched and avoids UDP port interference', async () => {
        const settings = options();
        const socket = new FakeSocket();
        settings.existingInstances.push({
            _id: 'system.adapter.siku.0',
            common: { name: 'siku' },
            native: {
                devices: [{ id: ID, name: 'Custom', enabled: false }],
                devicePasswords: [{ id: ID, password: 'encrypted' }],
            },
        });
        const snapshot = JSON.stringify(settings.existingInstances);
        assert.equal((await detectWithSocket(socket, settings)).found, false);
        assert.equal(socket.boundPort, undefined);
        assert.equal(settings.newInstances.length, 0);
        assert.equal(JSON.stringify(settings.existingInstances), snapshot);
    });
    it('does not duplicate an instance already proposed during this scan', async () => {
        const settings = options();
        const socket = new FakeSocket();
        settings.newInstances.push({ _id: 'system.adapter.siku.0', common: { name: 'siku' }, native: {} });
        assert.equal((await detectWithSocket(socket, settings)).found, false);
        assert.equal(socket.boundPort, undefined);
        assert.equal(settings.newInstances.length, 1);
    });
    it('bounds proposals on a noisy network to 64 unique devices', async () => {
        const settings = options();
        const socket = new FakeSocket();
        socket.reply = socket => {
            for (let n = 1; n <= 100; n++) {
                socket.emit('message', packet(n.toString(16).toUpperCase().padStart(16, '0')), {
                    address: '192.0.2.10',
                    port: 4000,
                });
            }
        };
        assert.equal((await detectWithSocket(socket, settings)).found, true);
        assert.equal(settings.newInstances[0].native.devices.length, 64);
    });
    it('finishes a silent network without proposing an adapter and closes its socket', async () => {
        const settings = options();
        const socket = new FakeSocket();
        assert.equal((await detectWithSocket(socket, settings)).found, false);
        assert.equal(socket.closed, true);
        assert.equal(settings.newInstances.length, 0);
    });
    it('handles an occupied port, send errors and late errors without a double callback', async () => {
        for (const event of ['bind', 'send']) {
            const socket = new FakeSocket();
            const settings = options();
            if (event === 'bind')
                socket.bind = () => queueMicrotask(() => socket.emit('error', new Error('EADDRINUSE')));
            else socket.send = (_buffer, _port, _ip, callback) => callback(new Error('send failed'));
            assert.equal((await detectWithSocket(socket, settings)).found, false);
            assert.equal(socket.closed, true);
            assert.equal(settings.newInstances.length, 0);
            assert.doesNotThrow(() => socket.emit('error', new Error('late error')));
        }
    });
    it('communicates with a real loopback UDP responder without using household fans', async () => {
        const original = dgram.createSocket;
        const server = original('udp4');
        await new Promise(resolve => server.bind(0, '127.0.0.1', resolve));
        server.on('message', (message, remote) => {
            assert.equal(message.toString('hex'), REQUEST);
            server.send(packet(), remote.port, remote.address);
        });
        // Isolate the integration test from the real UDP 4000 and LAN broadcasts.
        dgram.createSocket = config => {
            const socket = original(config);
            const bind = socket.bind.bind(socket);
            const send = socket.send.bind(socket);
            socket.bind = () => bind(0, '127.0.0.1');
            socket.send = (buffer, port, ip, callback) => {
                assert.equal(port, 4000);
                assert.equal(ip, '255.255.255.255');
                send(buffer, server.address().port, '127.0.0.1', callback);
            };
            return socket;
        };
        try {
            const settings = options();
            const result = await new Promise(resolve =>
                siku.detect('255.255.255.255', {}, settings, (error, found) => resolve({ error, found })),
            );
            assert.equal(result.found, true);
            assert.equal(settings.newInstances[0].native.devices[0].host, '127.0.0.1');
        } finally {
            dgram.createSocket = original;
            await new Promise(resolve => server.close(resolve));
        }
    });
});
