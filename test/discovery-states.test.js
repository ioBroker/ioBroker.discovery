'use strict';

/**
 * Tests for the two features behind the ToDo list in the README: mirroring the devices of a
 * scan into the object tree, and repeating a scan on a timer.
 *
 * The decisions of both live in lib/discovery-states so that they can be tested without a
 * running ioBroker - main.ts replaces its own module.exports for compact mode and therefore
 * cannot export anything a test could reach.
 */

const assert = require('node:assert');
const path = require('node:path');

const states = require(path.join('..', 'build', 'lib', 'discovery-states.js'));

describe('object ids from addresses', () => {
    it('replaces everything an ioBroker id may not carry', () => {
        assert.strictEqual(states.toObjectId('192.168.1.50'), '192_168_1_50');
        assert.strictEqual(states.toObjectId('/dev/ttyUSB0'), '_dev_ttyUSB0');
        assert.strictEqual(states.toObjectId('/dev/serial/by-id/usb-0658_0200-if00'), '_dev_serial_by-id_usb-0658_0200-if00');
        // a Windows port name is already clean
        assert.strictEqual(states.toObjectId('COM3'), 'COM3');
    });

    it('leaves nothing that could open a second level in the tree', () => {
        for (const address of ['a.b.c', 'a b', 'a/b', 'a\\b', 'a:b', 'fe80::1%eth0']) {
            assert.ok(!states.toObjectId(address).includes('.'), address);
        }
    });
});

describe('which devices belong in the tree', () => {
    it('keeps a real find and drops the once pseudo device', () => {
        assert.strictEqual(states.isRealDevice({ _addr: '192.168.1.50' }), true);
        // the `once` device stands for this host and is not something that was found
        assert.strictEqual(states.isRealDevice({ _addr: '0.0.0.0', _type: 'once' }), false);
        assert.strictEqual(states.isRealDevice({}), false);
    });

    it('keys the channels by address', () => {
        const wanted = states.wantedChannels([
            { _addr: '192.168.1.50', _name: 'shelly' },
            { _addr: '0.0.0.0', _type: 'once' },
            { _addr: '/dev/ttyUSB0', _type: 'serial' },
        ]);

        assert.deepStrictEqual([...wanted.keys()], ['192_168_1_50', '_dev_ttyUSB0']);
    });

    it('copes with an empty scan', () => {
        assert.strictEqual(states.wantedChannels([]).size, 0);
        assert.strictEqual(states.wantedChannels(undefined).size, 0);
    });
});

describe('channel naming', () => {
    it('shows the name next to the address', () => {
        assert.strictEqual(
            states.deviceChannelName({ _addr: '192.168.1.50', _name: 'shellyplug-s' }),
            'shellyplug-s (192.168.1.50)',
        );
    });

    it('does not repeat the address when there is no name', () => {
        assert.strictEqual(states.deviceChannelName({ _addr: '192.168.1.50' }), '192.168.1.50');
        assert.strictEqual(
            states.deviceChannelName({ _addr: '192.168.1.50', _name: '192.168.1.50' }),
            '192.168.1.50',
        );
    });
});

describe('the states of one device', () => {
    const device = {
        _addr: '192.168.1.50',
        _name: 'shellyplug-s',
        _type: 'mdns',
        _source: 'mdns',
        _detected: ['sonoff', 'shelly'],
    };

    it('describes what was found and who wants it', () => {
        const rows = states.deviceStateRows(device, 1700000000000);
        const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));

        assert.strictEqual(byKey.address, '192.168.1.50');
        assert.strictEqual(byKey.name, 'shellyplug-s');
        assert.strictEqual(byKey.type, 'mdns');
        assert.strictEqual(byKey.source, 'mdns');
        assert.strictEqual(byKey.lastSeen, 1700000000000);
        // sorted, so that two scans of an unchanged network write the same value
        assert.strictEqual(byKey.suggested, 'shelly, sonoff');
    });

    it('fills in for a device that told us little', () => {
        const rows = states.deviceStateRows({ _addr: '10.0.0.9' }, 1);
        const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));

        assert.strictEqual(byKey.name, '10.0.0.9', 'the address stands in for a missing name');
        assert.strictEqual(byKey.type, 'ip', 'ip is the default device type');
        assert.strictEqual(byKey.source, '');
        assert.strictEqual(byKey.suggested, '', 'nothing recognised it');
    });

    it('gives every state a type and a role', () => {
        for (const row of states.deviceStateRows(device, 1)) {
            assert.ok(['string', 'number'].includes(row.type), row.key);
            assert.ok(row.role, row.key);
            assert.strictEqual(typeof row.value, row.type, row.key);
        }
    });
});

describe('cleaning up devices that are gone', () => {
    const wanted = states.wantedChannels([{ _addr: '192.168.1.50' }]);

    it('names the channels of devices that did not turn up again', () => {
        const objectIds = [
            'discovery.0.devices.192_168_1_50',
            'discovery.0.devices.192_168_1_50.address',
            'discovery.0.devices.10_0_0_9',
            'discovery.0.devices.10_0_0_9.lastSeen',
        ];

        assert.deepStrictEqual(states.staleChannels(objectIds, 'discovery.0', wanted), ['10_0_0_9']);
    });

    it('leaves everything outside the device tree alone', () => {
        const objectIds = ['discovery.0.scanRunning', 'discovery.0.lastScan', 'discovery.0.devicesFound'];

        assert.deepStrictEqual(states.staleChannels(objectIds, 'discovery.0', wanted), []);
    });

    it('does not confuse a second instance with this one', () => {
        const objectIds = ['discovery.1.devices.10_0_0_9'];

        assert.deepStrictEqual(states.staleChannels(objectIds, 'discovery.0', wanted), []);
    });
});

describe('the scheduled scan', () => {
    it('an empty selection means the default methods', () => {
        const wanted = ['mdns', 'ping', 'udp', 'upnp'];
        assert.deepStrictEqual(states.DEFAULT_AUTO_DETECT_METHODS, wanted);
        assert.deepStrictEqual(states.autoDetectMethods({ autoDetectMethods: [] }), wanted);
        assert.deepStrictEqual(states.autoDetectMethods({}), wanted);
        assert.deepStrictEqual(states.autoDetectMethods({ autoDetectMethods: 'mdns' }), wanted);
    });

    it('leaves out what a timer should not run unasked', () => {
        // serial opens every serial port of the host, the other two only find their own vendor
        for (const method of ['serial', 'tr064', 'speedwire']) {
            assert.ok(!states.DEFAULT_AUTO_DETECT_METHODS.includes(method), method);
        }
    });

    it('hands out a copy, so that a caller cannot edit the defaults', () => {
        const methods = states.autoDetectMethods({});
        methods.push('serial');
        assert.ok(!states.DEFAULT_AUTO_DETECT_METHODS.includes('serial'));
    });

    it('passes a selection through and drops the empty entries', () => {
        assert.deepStrictEqual(states.autoDetectMethods({ autoDetectMethods: ['mdns', 'upnp'] }), ['mdns', 'upnp']);
        assert.deepStrictEqual(states.autoDetectMethods({ autoDetectMethods: ['mdns', '', null, 3] }), ['mdns']);
        // a selection of nothing but junk is no selection
        assert.deepStrictEqual(
            states.autoDetectMethods({ autoDetectMethods: ['', null] }),
            states.DEFAULT_AUTO_DETECT_METHODS,
        );
    });

    it('every default method exists as a module', () => {
        const fs = require('node:fs');
        const files = fs.readdirSync(path.join(__dirname, '..', 'build', 'lib', 'methods'));
        for (const method of states.DEFAULT_AUTO_DETECT_METHODS) {
            assert.ok(files.includes(`${method}.js`), method);
        }
    });

    it('holds the interval above the lower bound', () => {
        assert.strictEqual(states.autoDetectMinutes({ autoDetectInterval: 60 }), 60);
        // a scan costs minutes of network traffic; a one-minute interval is refused
        assert.strictEqual(states.autoDetectMinutes({ autoDetectInterval: 1 }), states.MIN_AUTO_DETECT_MINUTES);
        assert.strictEqual(states.autoDetectMinutes({ autoDetectInterval: 0 }), states.MIN_AUTO_DETECT_MINUTES);
        assert.strictEqual(states.autoDetectMinutes({ autoDetectInterval: -10 }), states.MIN_AUTO_DETECT_MINUTES);
    });

    it('takes the value as it comes out of an older configuration', () => {
        // an instance configured before this field existed delivers a string, or nothing
        assert.strictEqual(states.autoDetectMinutes({ autoDetectInterval: '120' }), 120);
        assert.strictEqual(states.autoDetectMinutes({}), 60);
        assert.strictEqual(states.autoDetectMinutes({ autoDetectInterval: 'often' }), 60);
    });

    it('waits before the first scan of a fresh start', () => {
        assert.ok(states.FIRST_AUTO_DETECT_DELAY >= 60000, 'the host is busy right at boot');
    });
});
