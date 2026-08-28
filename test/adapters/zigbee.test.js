'use strict';

/**
 * Tests for the Zigbee coordinator detection.
 *
 * The fingerprints come from `USB_FINGERPRINTS` in zigbee-herdsman's adapterDiscovery.ts -
 * the library the zigbee adapter drives its coordinator with. The hard part is not matching
 * a vendor id but refusing the generic USB-to-serial bridges that half the world's gadgets
 * sit behind; herdsman flags the same problem for 10c4:ea60.
 */

const assert = require('node:assert');
const path = require('node:path');

const zigbee = require(path.join('..', '..', 'build', 'lib', 'adapters', 'zigbee.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** A serial device the way methods/serial delivers it */
function serialDevice(port) {
    return { _addr: port.path, _type: 'serial', _source: 'serial', _name: port.manufacturer, _data: port };
}

function detect(device, options) {
    return new Promise(resolve => {
        zigbee.detect(device._addr, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('zigbee coordinator matching', () => {
    it('accepts a dedicated vendor id on its own', () => {
        // 0451:16a8 is a Texas Instruments CC2531, it is nothing else
        const match = zigbee.matchCoordinator({ path: '/dev/ttyACM0', vendorId: '0451', productId: '16a8' });

        assert.strictEqual(match.family, 'zstack');
    });

    it('recognises a ConBee II and names the deconz driver', () => {
        const match = zigbee.matchCoordinator({
            path: '/dev/serial/by-id/usb-dresden_elektronik_ingenieurtechnik_GmbH_ConBee_II_DE2132111-if00',
            vendorId: '1cf1',
            productId: '0030',
            manufacturer: 'dresden elektronik ingenieurtechnik GmbH',
        });

        assert.strictEqual(match.family, 'deconz');
        assert.strictEqual(match.score, 3, 'vendor id, manufacturer and path all agree');
    });

    it('refuses a bare CP210x bridge', () => {
        // 10c4:ea60 sits in countless devices that have nothing to do with Zigbee
        assert.strictEqual(
            zigbee.matchCoordinator({ path: '/dev/ttyUSB0', vendorId: '10c4', productId: 'ea60' }),
            null,
        );
    });

    it('accepts the same bridge once the manufacturer corroborates it', () => {
        const match = zigbee.matchCoordinator({
            path: '/dev/ttyUSB0',
            vendorId: '10c4',
            productId: 'ea60',
            manufacturer: 'ITEAD',
        });

        assert.strictEqual(match.family, 'ember');
    });

    it('accepts it when only the by-id path gives the vendor away', () => {
        // on Linux the vendor often shows up in the path but not in `manufacturer`
        const match = zigbee.matchCoordinator({
            path: '/dev/serial/by-id/usb-ITEAD_SONOFF_Zigbee_3.0_USB_Dongle_Plus_V2_20240122184111-if00',
            vendorId: '10c4',
            productId: 'ea60',
        });

        assert.ok(match, 'the path names the stick');
        assert.strictEqual(match.family, 'ember');
    });

    it('refuses ports without a USB descriptor at all', () => {
        assert.strictEqual(zigbee.matchCoordinator({ path: '/dev/ttyAMA0' }), null);
        assert.strictEqual(zigbee.matchCoordinator({}), null);
        assert.strictEqual(zigbee.matchCoordinator(undefined), null);
    });

    it('refuses an unrelated vendor', () => {
        assert.strictEqual(
            zigbee.matchCoordinator({ path: '/dev/ttyUSB0', vendorId: 'dead', productId: 'beef' }),
            null,
        );
    });
});

describe('zigbee detection', () => {
    it('is a serial module', () => {
        assert.strictEqual(zigbee.type, 'serial');
    });

    it('proposes the port and pre-selects the driver family', async () => {
        const options = freshOptions();
        const device = serialDevice({
            path: '/dev/ttyACM0',
            vendorId: '1cf1',
            productId: '0030',
            manufacturer: 'dresden elektronik ingenieurtechnik GmbH',
        });

        const { err, found } = await detect(device, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].native.port, '/dev/ttyACM0');
        // the setting users most often get wrong
        assert.strictEqual(options.newInstances[0].native.adapterType, 'deconz');
    });

    it('stays quiet for an ordinary USB serial adapter', async () => {
        const options = freshOptions();
        const device = serialDevice({ path: '/dev/ttyUSB0', vendorId: '0403', productId: '6001' });

        const { found } = await detect(device, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('does not propose a port that is already configured', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.zigbee.0',
            common: { name: 'zigbee' },
            native: { port: '/dev/ttyACM0', adapterType: 'zstack' },
        });
        const device = serialDevice({ path: '/dev/ttyACM0', vendorId: '0451', productId: '16a8' });

        const { found } = await detect(device, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
