'use strict';

/**
 * Tests for the serial group: cul, maxcul and ds18b20.
 *
 * cul and maxcul drive the same board in different firmware modes. The probe comes from the
 * `cul` npm library the adapter uses: it writes a bare `V` and the firmware answers with its
 * version banner. ds18b20 is not a serial device at all - the kernel exposes 1-Wire sensors
 * as directories, which is why that module is a `once` module reading the filesystem.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', 'adapters', ...parts);
const cul = require(build('cul.js'));
const maxcul = require(build('maxcul.js'));
const ds18b20 = require(build('ds18b20.js'));

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

describe('cul banner recognition', () => {
    it('accepts the banners the firmware actually sends', () => {
        assert.strictEqual(cul.isCulBanner('V 1.67 nanoCUL868'), true);
        assert.strictEqual(cul.isCulBanner('V 1.26 CUL868'), true);
        assert.strictEqual(cul.isCulBanner('  V 1.24 miniCUL433\r\n'), true);
    });

    it('refuses anything that is not a CUL', () => {
        // RFLink answers a version request too, but says something else
        assert.strictEqual(cul.isCulBanner('20;99;"RFLink Gateway software version";'), false);
        assert.strictEqual(cul.isCulBanner('V 1.67'), false, 'the board name is what identifies it');
        assert.strictEqual(cul.isCulBanner('Version 1.0'), false);
        assert.strictEqual(cul.isCulBanner(''), false);
    });
});

describe('serial module contract', () => {
    it('cul and maxcul are serial modules with room for two baud rates', () => {
        for (const [name, module] of Object.entries({ cul, maxcul })) {
            assert.deepStrictEqual(module.type, ['serial'], name);
            assert.ok(module.timeout > 2000, `${name} timeout ${module.timeout}`);
        }
    });

    it('ds18b20 runs once against the host, not against a device', () => {
        assert.deepStrictEqual(ds18b20.type, ['once']);
    });
});

describe('ds18b20 sensor listing', () => {
    /** A stand-in for node:fs with just the two calls the module makes */
    const fakeFs = entries => ({
        existsSync: () => entries !== null,
        readdirSync: () => entries,
    });

    it('picks the DS18B20 family code out of the directory', () => {
        const sensors = ds18b20.listSensors(
            '/sys/bus/w1/devices',
            fakeFs(['28-0119213b62ff', '28-011922aa11bb', 'w1_bus_master1']),
        );

        // family code 28 is the DS18B20; the bus master is not a sensor
        assert.deepStrictEqual(sensors, ['28-0119213b62ff', '28-011922aa11bb']);
    });

    it('ignores other 1-Wire families', () => {
        assert.deepStrictEqual(ds18b20.listSensors('/x', fakeFs(['10-000802b1c2d3', '3a-0000012345'])), []);
    });

    it('copes with a missing or unreadable directory', () => {
        assert.deepStrictEqual(ds18b20.listSensors('/x', fakeFs(null)), []);
        assert.deepStrictEqual(
            ds18b20.listSensors('/x', {
                existsSync: () => true,
                readdirSync: () => {
                    throw new Error('EACCES');
                },
            }),
            [],
        );
    });

    it('stays quiet on a host without 1-Wire', async () => {
        const options = freshOptions();

        // no /sys/bus/w1 on the machine running these tests
        const { found } = await detect(ds18b20, options, '0.0.0.0');

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('cul detection on a port that is not a CUL', () => {
    it('reports not found for a port nothing answers on', async function () {
        this.timeout(8000);
        const options = freshOptions();

        const { found } = await detect(cul, options, '/dev/does-not-exist');

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
