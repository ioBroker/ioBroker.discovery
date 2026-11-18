'use strict';

/**
 * Tests for the blustream-mfp probe. The STATUS headers below are copied from replies of real
 * units; the probe must find them, map the model to the adapter's deviceModel, and never write
 * to a telnet service that is not a Blustream unit.
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const blustream = require(path.join('..', '..', 'build', 'lib', 'adapters', 'blustream-mfp.js'));

// the module probes port 23; the tests use probe() on a port that needs no privileges
const PORT = 50023;
const RULE = '='.repeat(64);

const C66_GREETING = 'Please Input Your Command :\r\n';
const C66_STATUS = [
    RULE,
    '              C66 6x6 HDBaseT Matrix',
    '              FW Version: V1.0.1d',
    '',
    'Power      IR         Key        LCD        Baud       IRPON      IRFV       Output1    ',
    'ON         ON         ON         OFF        57600      ENABLE     ON         HDBT       ',
    '',
].join('\r\n');
const MFP72_STATUS = [RULE, 'HDMI MFP72  Status', 'FW Version: 2.11', 'Scaler Version: 1.36', 'Power\tIR\tKey'].join(
    '\r\n',
);

function freshOptions(existing = []) {
    return {
        newInstances: [],
        existingInstances: existing,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(options) {
    return new Promise(resolve => {
        blustream.probe('127.0.0.1', PORT, options, (err, found, addr) => resolve({ err, found, addr }));
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
 * A fake unit: sends `greeting` on connect (if any) and `reply` once it is sent STATUS.
 *
 * @param greeting text written straight after the connect, or null for a silent unit
 * @param reply text written after STATUS, or null for none
 */
function fakeUnit(greeting, reply) {
    const received = [];
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            socket.on('error', () => {});
            socket.on('data', d => {
                received.push(d);
                if (reply && /STATUS\r/.test(Buffer.concat(received).toString())) {
                    // a reply in two pieces, like the units send it line by line
                    socket.write(reply.slice(0, 20));
                    setTimeout(() => socket.writable && socket.write(`${reply.slice(20)}\r\n`), 20);
                }
            });
            if (greeting) {
                socket.write(greeting);
            }
        });
        server.once('error', reject);
        server.listen(PORT, '127.0.0.1', () => resolve({ server, received }));
    });
}

const close = server => new Promise(resolve => server.close(resolve));

describe('blustream-mfp', () => {
    describe('judgeGreeting', () => {
        it('goes at once on the Blustream greeting', () => {
            assert.strictEqual(blustream.judgeGreeting(Buffer.from(C66_GREETING)), 'go');
        });
        it('waits on silence and a prompt, and goes when the wait is over', () => {
            assert.strictEqual(blustream.judgeGreeting(Buffer.alloc(0)), 'wait');
            assert.strictEqual(blustream.judgeGreeting(Buffer.alloc(0), true), 'go');
            assert.strictEqual(blustream.judgeGreeting(Buffer.from('MX44AVW> '), true), 'go');
        });
        it('reads past telnet negotiation', () => {
            assert.strictEqual(blustream.judgeGreeting(Buffer.from([0xff, 0xfb, 0x01, 0xff, 0xfd, 0x03]), true), 'go');
        });
        it('stops on a login prompt, even before the wait is over', () => {
            assert.strictEqual(blustream.judgeGreeting(Buffer.from('\r\nrouter login: ')), 'stop');
            assert.strictEqual(blustream.judgeGreeting(Buffer.from('User Name:')), 'stop');
            assert.strictEqual(blustream.judgeGreeting(Buffer.from('Password: ')), 'stop');
        });
        it('stops on any other banner', () => {
            assert.strictEqual(blustream.judgeGreeting(Buffer.from('SSH-2.0-OpenSSH_9.6\r\n'), true), 'stop');
            assert.strictEqual(blustream.judgeGreeting(Buffer.from('Welcome to the switch\r\n'), true), 'stop');
        });
    });

    describe('parseStatusHeader', () => {
        const header = lines => Buffer.from(`${lines.join('\r\n')}\r\n`);

        it('reads the model of the real header layouts', () => {
            assert.strictEqual(blustream.parseStatusHeader(Buffer.from(C66_STATUS)), 'C66');
            assert.strictEqual(blustream.parseStatusHeader(Buffer.from(MFP72_STATUS)), 'MFP72');
            assert.strictEqual(
                blustream.parseStatusHeader(
                    header([
                        'status',
                        '',
                        RULE,
                        '              C88CS 8x8 HDBaseT Matrix',
                        '              FW Version: V1.6.0',
                    ]),
                ),
                'C88CS',
            );
            assert.strictEqual(
                blustream.parseStatusHeader(
                    header([
                        RULE,
                        '              SW41HDBT - 4x1 HDBaseT Switch w/ HDBaseT and HDMI output',
                        '              FW Version V1.2.0',
                    ]),
                ),
                'SW41HDBT',
            );
            assert.strictEqual(
                blustream.parseStatusHeader(
                    header([`MX44AVW> ${RULE}`, '     HDMI MX44AVW Status', '     FW Version MB:1.35  WEB:0.0']),
                ),
                'MX44AVW',
            );
            assert.strictEqual(
                blustream.parseStatusHeader(
                    header([
                        RULE,
                        '              CMX44CS-V2 4x4 4K HDMI 2.0 Matrix',
                        '              MCU FW Version: V1.2.1',
                    ]),
                ),
                'CMX44CS-V2',
            );
            assert.strictEqual(
                blustream.parseStatusHeader(
                    header(['='.repeat(97), '              HDMI SW42DA-V2 Status', '              FW Version: V1.1.0']),
                ),
                'SW42DA-V2',
            );
        });
        it('waits for complete lines', () => {
            assert.strictEqual(
                blustream.parseStatusHeader(Buffer.from(`${RULE}\r\n   C66 6x6 HDBaseT Matrix\r\n   FW Ver`)),
                null,
            );
        });
        it('ignores a rule without a FW Version line under it', () => {
            assert.strictEqual(
                blustream.parseStatusHeader(header([RULE, 'something', 'else', 'entirely', 'FW Version: 1'])),
                null,
            );
            assert.strictEqual(blustream.parseStatusHeader(header(['============== RS232 01', 'FW Version: 1'])), null);
        });
    });

    describe('modelKey', () => {
        it('maps header names to the adapter models', () => {
            assert.strictEqual(blustream.modelKey('C66'), 'c66');
            assert.strictEqual(blustream.modelKey('C66CS'), 'c66cs');
            assert.strictEqual(blustream.modelKey('MFP112'), 'mfp112');
            assert.strictEqual(blustream.modelKey('HMXL42ARC-KIT'), 'hmxl42arc');
            assert.strictEqual(blustream.modelKey('HMX88-18G'), 'hmx88_18g');
            assert.strictEqual(blustream.modelKey('CMX44CS-V2'), 'cmx44cs');
            assert.strictEqual(blustream.modelKey('SW21AB-V3'), 'sw21abv3');
        });
        it('falls back from a revision suffix only', () => {
            assert.strictEqual(blustream.modelKey('SW42DA-V2'), 'sw42da');
            assert.strictEqual(blustream.modelKey('C66XYZ'), null);
        });
        it('knows no models the adapter does not support', () => {
            assert.strictEqual(blustream.modelKey('SW14USB'), null);
            assert.strictEqual(blustream.modelKey('ACM200'), null);
            assert.strictEqual(blustream.modelKey(''), null);
        });
    });

    it('budgets more than its own probe timer', () => {
        assert.deepStrictEqual(blustream.type, ['ip']);
        assert.ok(blustream.timeout > 2500);
    });

    describe('detect', function () {
        this.timeout(6000);
        let ctx = null;
        beforeEach(async function () {
            if (!(await portUsable(PORT))) {
                this.skip();
            }
        });
        afterEach(async () => {
            if (ctx) {
                await close(ctx.server);
                ctx = null;
            }
        });

        it('finds a C66 from greeting and STATUS and proposes it', async () => {
            ctx = await fakeUnit(C66_GREETING, C66_STATUS);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, true);
            assert.strictEqual(Buffer.concat(ctx.received).toString(), 'STATUS\r');
            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0].common.name, 'blustream-mfp');
            assert.deepStrictEqual(options.newInstances[0].native, {
                connectionType: 'ip',
                ipAddress: '127.0.0.1',
                ipPort: PORT,
                deviceModel: 'c66',
            });
        });

        it('finds a silent unit after the greeting wait', async () => {
            ctx = await fakeUnit(null, MFP72_STATUS);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, true);
            assert.strictEqual(options.newInstances[0].native.deviceModel, 'mfp72');
        });

        it('writes nothing to a login prompt', async () => {
            ctx = await fakeUnit('\r\nswitch login: ', C66_STATUS);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(ctx.received.length, 0, 'the probe must not write to a login prompt');
            assert.strictEqual(options.newInstances.length, 0);
        });

        it('writes nothing to another banner', async () => {
            ctx = await fakeUnit('SSH-2.0-OpenSSH_9.6\r\n', C66_STATUS);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(ctx.received.length, 0);
        });

        it('does not find a silent service that does not answer STATUS', async () => {
            ctx = await fakeUnit(null, null);
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        });

        it('proposes nothing for a model the adapter does not support', async () => {
            ctx = await fakeUnit(
                null,
                [RULE, '              SW14USB 10Gbps USB 3.2 G2 Switcher', '              FW Version: V1.0.0f'].join(
                    '\r\n',
                ),
            );
            const options = freshOptions();
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        });

        it('proposes nothing when an instance for the address exists', async () => {
            ctx = await fakeUnit(C66_GREETING, C66_STATUS);
            const options = freshOptions([
                {
                    _id: 'system.adapter.blustream-mfp.0',
                    common: { name: 'blustream-mfp' },
                    native: { connectionType: 'ip', ipAddress: '127.0.0.1', ipPort: 23, deviceModel: 'c66' },
                },
            ]);
            const { found } = await detect(options);

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        });
    });
});
