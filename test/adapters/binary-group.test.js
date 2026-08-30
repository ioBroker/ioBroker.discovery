'use strict';

/**
 * Tests for the three binary/line protocols: luxtronik2-controller, iiyama-prolite and
 * viessmann.
 *
 * Where each probe comes from:
 *   luxtronik2-controller  lib/rawFunctions.js - createCommandBuffer(3004, 0) over TCP, and
 *                          parseRawResponse() with its twelve byte header for that command
 *   iiyama-prolite         lib/iiyama-protocol.js - buildCommand()/parseResponse() and the
 *                          XOR checksum, with POWER_STATE_GET (25) as the read
 *   viessmann              main.js tests the answer against /vctrld>/ - vcontrold prompts by
 *                          itself, so nothing is written
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const luxtronik = require(build('luxtronik2-controller.js'));
const iiyama = require(build('iiyama-prolite.js'));
const viessmann = require(build('viessmann.js'));

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
 * A TCP server that answers with whatever `reply` makes of the request.
 *
 * @param port port to listen on
 * @param reply called with the received bytes; return a Buffer to send or null to stay quiet
 * @param greeting sent as soon as a client connects, before anything is received
 */
function serveTcp(port, reply, greeting) {
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            if (greeting) {
                socket.write(greeting);
            }
            socket.on('data', data => {
                const answer = reply && reply(data);
                if (answer) {
                    socket.write(answer);
                }
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

describe('module contract', () => {
    it('all three probe over TCP and leave the watchdog room', () => {
        for (const [name, module] of Object.entries({ luxtronik, iiyama, viessmann })) {
            assert.deepStrictEqual(module.type, ['ip'], name);
            assert.ok(module.timeout > 1400, `${name} timeout ${module.timeout}`);
        }
    });
});

describe('luxtronik raw protocol', () => {
    /**
     * The answer to 3004: command, status, item count, then the values.
     *
     * @param command the command to echo back
     * @param items how many measurements to claim
     */
    function valuesAnswer(command, items) {
        const answer = Buffer.alloc(12);
        answer.writeInt32BE(command, 0);
        answer.writeInt32BE(0, 4);
        answer.writeInt32BE(items, 8);
        return answer;
    }

    it('asks with the eight byte command buffer', () => {
        const request = luxtronik.readValuesRequest();

        assert.strictEqual(request.length, 8);
        assert.strictEqual(request.readInt32BE(0), 3004, 'CMD_READ_VALUE, the read - 3002 would write');
        assert.strictEqual(request.readInt32BE(4), 0);
    });

    it('reads the item count out of the header', () => {
        assert.strictEqual(luxtronik.parseValueHeader(valuesAnswer(3004, 194)), 194);
    });

    it('refuses an answer to another command or an absurd count', () => {
        assert.strictEqual(luxtronik.parseValueHeader(valuesAnswer(3003, 194)), null, 'that is the parameter list');
        assert.strictEqual(luxtronik.parseValueHeader(valuesAnswer(3004, 0)), null);
        assert.strictEqual(luxtronik.parseValueHeader(valuesAnswer(3004, 999999)), null);
        assert.strictEqual(luxtronik.parseValueHeader(Buffer.alloc(8)), null, 'header not complete');
    });

    it('proposes the controller with the port that answered', async function () {
        this.timeout(8000);
        if (!(await portUsable(8889))) {
            return this.skip();
        }
        const server = await serveTcp(8889, request =>
            request.readInt32BE(0) === 3004 ? valuesAnswer(3004, 194) : null,
        );
        const options = freshOptions();

        try {
            const { found } = await detect(luxtronik, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.port, 8889);
            assert.ok(options.newInstances[0].comment.add[0].includes('194'));
        } finally {
            await close(server);
        }
    });

    it('ignores a service on the same port that answers something else', async function () {
        this.timeout(8000);
        if (!(await portUsable(8889))) {
            return this.skip();
        }
        const server = await serveTcp(8889, () => Buffer.from('HTTP/1.1 400 Bad Request\r\n\r\n'));
        const options = freshOptions();

        try {
            const { found } = await detect(luxtronik, options);

            assert.strictEqual(found, false);
        } finally {
            await close(server);
        }
    });
});

describe('iiyama display protocol', () => {
    it('builds the packet with the XOR checksum', () => {
        const request = iiyama.powerStateRequest();

        // A6 | monitor 1 | 00 00 00 | length 3 | data control 01 | code 25 | checksum
        assert.strictEqual(request.toString('hex'), 'a601000000030119bc');
        const checksum = [...request.subarray(0, request.length - 1)].reduce((acc, byte) => acc ^ byte, 0);
        assert.strictEqual(checksum, request[request.length - 1]);
    });

    it('accepts a frame whose checksum comes out', () => {
        const frame = Buffer.from([0x21, 0x01, 0x00, 0x00, 0x04, 0x01, 0x19, 0x02, 0x00]);
        frame[8] = [...frame.subarray(0, 8)].reduce((acc, byte) => acc ^ byte, 0);

        assert.strictEqual(iiyama.isDisplayAnswer(frame), true);
    });

    it('refuses a broken checksum, a foreign header and a short frame', () => {
        const frame = Buffer.from([0x21, 0x01, 0x00, 0x00, 0x04, 0x01, 0x19, 0x02, 0xff]);
        assert.strictEqual(iiyama.isDisplayAnswer(frame), false);

        const foreign = Buffer.from([0x02, 0x01, 0x00, 0x00, 0x04, 0x01, 0x19, 0x02, 0x00]);
        foreign[8] = [...foreign.subarray(0, 8)].reduce((acc, byte) => acc ^ byte, 0);
        assert.strictEqual(iiyama.isDisplayAnswer(foreign), false);

        assert.strictEqual(iiyama.isDisplayAnswer(Buffer.alloc(4)), false);
    });

    it('proposes the display when it answers the power query', async function () {
        this.timeout(8000);
        if (!(await portUsable(5000))) {
            return this.skip();
        }
        const answer = Buffer.from([0x21, 0x01, 0x00, 0x00, 0x04, 0x01, 0x19, 0x02, 0x00]);
        answer[8] = [...answer.subarray(0, 8)].reduce((acc, byte) => acc ^ byte, 0);

        const server = await serveTcp(5000, request => (request[0] === 0xa6 ? answer : null));
        const options = freshOptions();

        try {
            const { found } = await detect(iiyama, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.host, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.monitorId, 1);
        } finally {
            await close(server);
        }
    });
});

describe('viessmann vcontrold prompt', () => {
    it('recognises the prompt the adapter itself looks for', () => {
        assert.strictEqual(viessmann.isVcontroldPrompt('vctrld>'), true);
        assert.strictEqual(viessmann.isVcontroldPrompt('\r\nvctrld> '), true);
    });

    it('refuses anything else on that port', () => {
        assert.strictEqual(viessmann.isVcontroldPrompt('SSH-2.0-OpenSSH_9.2'), false);
        assert.strictEqual(viessmann.isVcontroldPrompt('220 ESMTP ready'), false);
        assert.strictEqual(viessmann.isVcontroldPrompt(''), false);
    });

    it('proposes the daemon and asks what it cannot read itself', async function () {
        this.timeout(8000);
        if (!(await portUsable(3002))) {
            return this.skip();
        }
        // vcontrold greets on its own - the probe writes nothing
        const server = await serveTcp(3002, null, 'vctrld>');
        const options = freshOptions();

        try {
            const { found } = await detect(viessmann, options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.ip, '127.0.0.1');
            assert.strictEqual(options.newInstances[0].native.port, '3002', 'the adapter keeps the port as text');
            assert.deepStrictEqual(
                options.newInstances[0].comment.inputs.map(i => i.name),
                ['native.path', 'native.user_name', 'native.password'],
            );
        } finally {
            await close(server);
        }
    });

    it('ignores another service on port 3002', async function () {
        this.timeout(8000);
        if (!(await portUsable(3002))) {
            return this.skip();
        }
        const server = await serveTcp(3002, null, 'SSH-2.0-OpenSSH_9.2p1\r\n');
        const options = freshOptions();

        try {
            const { found } = await detect(viessmann, options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        } finally {
            await close(server);
        }
    });
});
