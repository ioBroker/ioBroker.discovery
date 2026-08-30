'use strict';

/**
 * Tests for the second serial batch: enocean, smartmeter, wireless-mbus, pylontech,
 * elero-usb-transmitter and canbus.
 *
 * Every frame below was read out of the code that drives the hardware:
 *   enocean       main.js sendData() builds the ESP3 frame, getGatewayInfo() asks CO_RD_VERSION
 *   smartmeter    smartmeter-obis SmlProtocol.js looks for the 1b1b1b1b01010101 escape
 *   wireless-mbus lib/receiver/AmberMessage.js - frame, XOR checksum and CMD_FWV_REQ
 *   pylontech     lib/pylontech/ConsolenReader.js - the `$$` terminator and the [Enter] prompt
 *   elero         elero-usb-transmitter-client constants.js - header, EASY_CHECK, checksum rule
 *   canbus        not serial at all: ARPHRD_CAN is 280 in the kernel's if_arp.h
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const enocean = require(build('enocean.js'));
const smartmeter = require(build('smartmeter.js'));
const wmbus = require(build('wireless-mbus.js'));
const pylontech = require(build('pylontech.js'));
const elero = require(build('elero-usb-transmitter.js'));
const canbus = require(build('canbus.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(module, options, addr = '/dev/ttyUSB0') {
    return new Promise(resolve => {
        module.detect(addr, { _addr: addr }, options, (err, found, name) => resolve({ err, found, name }));
    });
}

describe('serial module contract', () => {
    it('the five port modules are serial and outlast their own listening window', () => {
        for (const [name, module] of Object.entries({ enocean, smartmeter, wmbus, pylontech, elero })) {
            assert.deepStrictEqual(module.type, ['serial'], name);
            assert.ok(module.timeout >= 1500, `${name} timeout ${module.timeout}`);
        }
    });

    it('canbus runs once against the host - a CAN adapter is no serial port', () => {
        assert.deepStrictEqual(canbus.type, ['once']);
    });
});

describe('enocean ESP3 frame', () => {
    it('builds the CO_RD_VERSION telegram the adapter builds', () => {
        // 55 | 00 01 00 05 | crc8(header) | 03 | crc8(data)
        assert.strictEqual(enocean.versionRequest().toString('hex'), '5500010005700309');
    });

    it('computes the CRC8 of the EnOcean table', () => {
        // the two checksums of the frame above, and the empty case
        assert.strictEqual(enocean.crc8(Buffer.from([0x00, 0x01, 0x00, 0x05])), 0x70);
        assert.strictEqual(enocean.crc8(Buffer.from([0x03])), 0x09);
        assert.strictEqual(enocean.crc8(Buffer.from([])), 0x00);
    });

    it('reads the gateway out of a RESPONSE packet', () => {
        const answer = Buffer.alloc(40);
        const header = Buffer.from([0x00, 0x21, 0x00, 0x02]);
        answer[0] = 0x55;
        header.copy(answer, 1);
        answer[5] = enocean.crc8(header);
        Buffer.from('01234567', 'hex').copy(answer, 15); // chip id
        Buffer.from('GATEWAYCTRL', 'utf8').copy(answer, 23); // application description

        const info = enocean.parseVersionResponse(answer);

        assert.strictEqual(info.chipId, '01234567');
        assert.strictEqual(info.description, 'GATEWAYCTRL');
    });

    it('refuses anything whose header checksum does not add up', () => {
        const answer = Buffer.alloc(40);
        answer[0] = 0x55;
        answer[4] = 0x02;
        answer[5] = 0xff; // wrong CRC8

        assert.strictEqual(enocean.parseVersionResponse(answer), null);
        // a RADIO packet is not the answer to a common command
        const radio = Buffer.from([0x55, 0x00, 0x07, 0x07, 0x01, 0x7a, 0x00]);
        assert.strictEqual(enocean.parseVersionResponse(radio), null);
        assert.strictEqual(enocean.parseVersionResponse(Buffer.alloc(3)), null);
    });
});

describe('smartmeter SML telegram', () => {
    const ESCAPE = Buffer.from([0x1b, 0x1b, 0x1b, 0x1b, 0x01, 0x01, 0x01, 0x01]);

    it('finds the escape sequence anywhere in the stream', () => {
        assert.strictEqual(smartmeter.hasSmlTelegram(ESCAPE), true);
        // the head hands over mid-telegram, so the start rarely sits at offset zero
        assert.strictEqual(smartmeter.hasSmlTelegram(Buffer.concat([Buffer.from('junk'), ESCAPE])), true);
    });

    it('is not fooled by loose escape bytes', () => {
        assert.strictEqual(smartmeter.hasSmlTelegram(Buffer.from([0x1b, 0x1b, 0x1b, 0x1b])), false);
        assert.strictEqual(smartmeter.hasSmlTelegram(Buffer.from('/ESY5Q3DA1004 V3.04\r\n')), false, 'that is D0');
        assert.strictEqual(smartmeter.hasSmlTelegram(Buffer.alloc(0)), false);
    });
});

describe('wireless-mbus Amber stick', () => {
    it('builds the firmware request with the XOR checksum', () => {
        assert.strictEqual(wmbus.firmwareRequest().toString('hex'), 'ff0c00f3');
    });

    it('reads the version out of the confirmation', () => {
        // FF | 8C (0x0C with the confirm bit) | 03 | 1 2 3 | checksum
        const reply = Buffer.from([0xff, 0x8c, 0x03, 0x01, 0x02, 0x03, 0x00]);
        reply[6] = wmbus.amberChecksum(reply);

        assert.strictEqual(wmbus.parseFirmwareAnswer(reply), '1.2.3');
    });

    it('refuses a wrong command, a wrong checksum and a short frame', () => {
        const wrongCommand = Buffer.from([0xff, 0x83, 0x03, 0x01, 0x02, 0x03, 0x00]);
        wrongCommand[6] = wmbus.amberChecksum(wrongCommand);
        assert.strictEqual(wmbus.parseFirmwareAnswer(wrongCommand), null);

        assert.strictEqual(wmbus.parseFirmwareAnswer(Buffer.from([0xff, 0x8c, 0x03, 0x01, 0x02, 0x03, 0xaa])), null);
        assert.strictEqual(wmbus.parseFirmwareAnswer(Buffer.from([0xff, 0x8c, 0x03])), null);
        assert.strictEqual(wmbus.parseFirmwareAnswer(Buffer.from([0x00, 0x8c, 0x03, 0x01, 0x02, 0x03, 0x00])), null);
    });
});

describe('pylontech console', () => {
    it('recognises both markers the adapter own reader uses', () => {
        assert.strictEqual(pylontech.isPylontechConsole('Press [Enter] to continue'), true);
        assert.strictEqual(pylontech.isPylontechConsole('\r\npylon>\r\ncommand\r\n$$\r\n'), true);
    });

    it('refuses an answer with no prompt in front of the terminator', () => {
        assert.strictEqual(pylontech.isPylontechConsole('$$ with nothing before it'), false);
        assert.strictEqual(pylontech.isPylontechConsole('V 1.67 nanoCUL868'), false);
        assert.strictEqual(pylontech.isPylontechConsole(''), false);
    });
});

describe('elero transmitter stick', () => {
    it('builds an EASY_CHECK that adds up to zero', () => {
        const request = elero.checkRequest();

        assert.strictEqual(request.toString('hex'), 'aa024a0a');
        // the rule the library states: header to checksum must sum to 0x00
        assert.strictEqual([...request].reduce((total, byte) => total + byte, 0) % 256, 0);
    });

    it('computes the checksum the way the library does', () => {
        assert.strictEqual(elero.eleroChecksum([0xaa, 0x02, 0x4a]), 0x0a);
        assert.strictEqual(elero.eleroChecksum([0x00]), 0x00);
    });

    it('reads the learned channels out of the confirmation', () => {
        // AA | 04 | 4B | high channels | low channels | checksum - channels 1, 3 and 9
        const frame = [0xaa, 0x04, 0x4b, 0b00000001, 0b00000101];
        const reply = Buffer.from([...frame, elero.eleroChecksum(frame)]);

        assert.deepStrictEqual(elero.parseCheckAnswer(reply), [1, 3, 9]);
    });

    it('accepts a stick with nothing learned yet', () => {
        const frame = [0xaa, 0x04, 0x4b, 0x00, 0x00];
        const reply = Buffer.from([...frame, elero.eleroChecksum(frame)]);

        assert.deepStrictEqual(elero.parseCheckAnswer(reply), []);
    });

    it('refuses a wrong header, a wrong command and a broken checksum', () => {
        assert.strictEqual(elero.parseCheckAnswer(Buffer.from([0x55, 0x04, 0x4b, 0, 0, 0])), null);
        assert.strictEqual(elero.parseCheckAnswer(Buffer.from([0xaa, 0x04, 0x4d, 0, 0, 0x05])), null);
        assert.strictEqual(elero.parseCheckAnswer(Buffer.from([0xaa, 0x04, 0x4b, 0, 0, 0x99])), null);
        assert.strictEqual(elero.parseCheckAnswer(Buffer.from([0xaa, 0x04, 0x4b])), null);
    });
});

describe('canbus interface listing', () => {
    function fakeFs(interfaces) {
        return {
            existsSync: () => true,
            readdirSync: () => Object.keys(interfaces),
            readFileSync: file => {
                const name = file.split('/').slice(-2)[0];
                if (interfaces[name] === undefined) {
                    throw new Error('ENOENT');
                }
                return `${interfaces[name]}\n`;
            },
        };
    }

    it('picks the CAN interfaces out of sysfs', () => {
        // 1 is Ethernet, 801 is wireless, 280 is ARPHRD_CAN
        const list = canbus.listCanInterfaces('/sys/class/net', fakeFs({ eth0: 1, wlan0: 801, can0: 280, can1: 280 }));

        assert.deepStrictEqual(list, ['can0', 'can1']);
    });

    it('copes with an interface that vanishes while it is read', () => {
        const list = canbus.listCanInterfaces('/sys/class/net', fakeFs({ eth0: 1, gone: undefined, can0: 280 }));

        assert.deepStrictEqual(list, ['can0']);
    });

    it('finds nothing where sysfs does not exist', () => {
        const list = canbus.listCanInterfaces('/sys/class/net', {
            existsSync: () => false,
            readdirSync: () => {
                throw new Error('should not be called');
            },
            readFileSync: () => '',
        });

        assert.deepStrictEqual(list, []);
    });

    it('stays quiet on a host without a CAN bus', async () => {
        const options = freshOptions();

        // Windows and macOS have no sysfs at all, Linux hosts usually have no CAN interface
        const { found } = await detect(canbus, options, '0.0.0.0');

        if (found) {
            // a host that really has one - then the proposal has to be shaped right
            assert.match(options.newInstances[0].native.interface, /^can/);
        } else {
            assert.strictEqual(options.newInstances.length, 0);
        }
    });
});

describe('serial detection on a port that is not there', () => {
    for (const [name, module] of Object.entries({ enocean, smartmeter, wmbus, pylontech, elero })) {
        it(`${name} reports not found for a port nothing answers on`, async function () {
            this.timeout(8000);
            const options = freshOptions();

            const { found } = await detect(module, options, '/dev/does-not-exist');

            assert.strictEqual(found, false);
            assert.strictEqual(options.newInstances.length, 0);
        });
    }
});
