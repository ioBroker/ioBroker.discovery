'use strict';

/**
 * Tests for jellyfin.
 *
 * Where the probe comes from:
 *   Jellyfin server  src/Jellyfin.Networking/AutoDiscoveryHost.cs - `who is JellyfinServer?` on UDP 7359,
 *                    answered with the JSON of ServerDiscoveryInfo (Address, Id, Name, EndpointAddress)
 */

const assert = require('node:assert');
const dgram = require('node:dgram');
const path = require('node:path');

const jellyfin = require(path.join('..', '..', 'build', 'lib', 'adapters', 'jellyfin.js'));

function freshOptions(existing = []) {
    return {
        newInstances: [],
        existingInstances: existing,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(options, ip = '127.0.0.1') {
    return new Promise(resolve => {
        jellyfin.detect(ip, {}, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

/**
 * A fake Jellyfin discovery listener on 127.0.0.1:7359.
 *
 * @param answer what to send back for a received text (null = stay silent)
 */
function serveUdp(answer) {
    return new Promise(resolve => {
        const server = dgram.createSocket('udp4');
        const received = [];
        server.on('message', (msg, remote) => {
            received.push(msg.toString());
            const reply = answer(msg.toString());
            if (reply !== null) {
                server.send(
                    Buffer.from(typeof reply === 'string' ? reply : JSON.stringify(reply)),
                    remote.port,
                    remote.address,
                );
            }
        });
        server.once('error', () => resolve(null));
        server.bind(7359, '127.0.0.1', () => resolve({ server, received }));
    });
}

const close = socket => new Promise(resolve => socket.close(resolve));

const JELLYFIN_ANSWER = text =>
    text.includes('who is JellyfinServer?')
        ? {
              Address: 'http://172.17.0.5:8096',
              Id: '17be1319e5ed41c0b95361ed7b979f55',
              Name: 'Wohnzimmer',
              EndpointAddress: null,
          }
        : null;

describe('jellyfin', function () {
    this.timeout(5000);

    it('leaves the watchdog room', () => {
        assert.ok(jellyfin.timeout > 1400);
        assert.deepStrictEqual(jellyfin.type, ['ip']);
    });

    it('builds the address from the answering ip and the reported scheme and port', () => {
        assert.strictEqual(jellyfin.serverUrl('192.168.1.14', 'http://172.17.0.5:8096'), 'http://192.168.1.14:8096');
        assert.strictEqual(jellyfin.serverUrl('192.168.1.14', 'https://jellyfin.example.com'), 'https://192.168.1.14');
        assert.strictEqual(jellyfin.serverUrl('192.168.1.14', 'http://192.168.1.14:8097/'), 'http://192.168.1.14:8097');
        assert.strictEqual(jellyfin.serverUrl('192.168.1.14', 'nonsense ::'), 'http://192.168.1.14:8096');
        assert.strictEqual(jellyfin.serverUrl('192.168.1.14', undefined), 'http://192.168.1.14:8096');
    });

    it('proposes an instance for a server that answers', async function () {
        const fake = await serveUdp(JELLYFIN_ANSWER);
        if (!fake) {
            this.skip(); // port 7359 in use on this host
        }
        try {
            const options = freshOptions();
            const result = await detect(options);
            assert.strictEqual(result.found, true);
            assert.deepStrictEqual(fake.received, ['who is JellyfinServer?']);
            assert.strictEqual(options.newInstances.length, 1);
            const instance = options.newInstances[0];
            assert.strictEqual(instance._id, 'system.adapter.jellyfin.0');
            assert.strictEqual(instance.common.title, 'Jellyfin (Wohnzimmer)');
            assert.deepStrictEqual(instance.native, { url: 'http://127.0.0.1:8096', apiKey: '' });
        } finally {
            await close(fake.server);
        }
    });

    it('proposes nothing when an instance already uses this server', async function () {
        const fake = await serveUdp(JELLYFIN_ANSWER);
        if (!fake) {
            this.skip();
        }
        try {
            const options = freshOptions([
                {
                    _id: 'system.adapter.jellyfin.0',
                    common: { name: 'jellyfin' },
                    native: { url: 'http://127.0.0.1:8097' },
                },
            ]);
            const result = await detect(options);
            assert.strictEqual(result.found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(fake.server);
        }
    });

    it('ignores answers that are not a Jellyfin server', async function () {
        const fake = await serveUdp(() => '{"Address":"http://127.0.0.1:8096","Name":"no id"}');
        if (!fake) {
            this.skip();
        }
        try {
            const options = freshOptions();
            const result = await detect(options);
            assert.strictEqual(result.found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(fake.server);
        }
    });

    it('gives up quietly when nobody answers', async () => {
        const options = freshOptions();
        const result = await detect(options, '127.0.0.2');
        assert.strictEqual(result.found, false);
        assert.strictEqual(result.err, null);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
