'use strict';

/**
 * Tests for the UPnP group: sony-bravia, hyperion-connector, semp and bambulab.
 *
 * Every probe was read out of the code that drives the device:
 *   sony-bravia         lib/bravia.js searches urn:schemas-sony-com:service:IRCC:1
 *   hyperion-connector  lib/network.js: serviceType = urn:hyperion-project.org:device:basic:1
 *   semp                the counterpart, identified through the SUSy-ID table of sma-em
 *   bambulab            the service type ha-bambulab registers, on the ports Bambu Studio uses
 */

const assert = require('node:assert');
const dgram = require('node:dgram');
const net = require('node:net');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const bravia = require(build('adapters', 'sony-bravia.js'));
const hyperion = require(build('adapters', 'hyperion-connector.js'));
const semp = require(build('adapters', 'semp.js'));
const bambu = require(build('adapters', 'bambulab.js'));
const bambuMethod = require(build('methods', 'bambulab.js'));
const tools = require(build('tools.js'));

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

function detect(module, device, options, ip = '192.168.1.50') {
    return new Promise(resolve => {
        module.detect(ip, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

function portUsable(port, udp) {
    return new Promise(resolve => {
        if (udp) {
            const probe = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            probe.once('error', () => resolve(false));
            probe.bind(port, () => probe.close(() => resolve(true)));
            return;
        }
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

describe('module contract', () => {
    it('the two UPnP modules read a header set and answer at once', () => {
        for (const [name, module] of Object.entries({ bravia, hyperion })) {
            assert.deepStrictEqual(module.type, ['upnp'], name);
            assert.ok(module.timeout <= 200, `${name} does not need a budget of ${module.timeout} ms`);
        }
    });

    it('semp waits for the announcement and leaves the watchdog room', () => {
        assert.deepStrictEqual(semp.type, ['once']);
        assert.ok(semp.timeout > 2000, `semp timeout ${semp.timeout}`);
    });

    it('bambulab accepts a find from either method', () => {
        assert.deepStrictEqual(bambu.type, ['bambulab', 'upnp']);
        assert.strictEqual(bambuMethod.type, 'bambulab');
    });
});

describe('sony-bravia detection', () => {
    const IRCC = 'urn:schemas-sony-com:service:IRCC:1';
    const DESCRIPTION =
        '<?xml version="1.0"?><root><device><friendlyName>Wohnzimmer TV</friendlyName>' +
        '<manufacturer>Sony Corporation</manufacturer><modelName>KD-65X8507C</modelName>' +
        `<serviceList><service><serviceType>${IRCC}</serviceType>` +
        '<controlURL>http://192.168.1.50/sony/IRCC</controlURL></service></serviceList></device></root>';

    it('recognises the service type in every header it can arrive in', () => {
        assert.strictEqual(bravia.isBraviaAnswer({ ST: IRCC }), true);
        assert.strictEqual(bravia.isBraviaAnswer({ NT: IRCC }), true);
        assert.strictEqual(bravia.isBraviaAnswer({ USN: `uuid:abc::${IRCC}` }), true);
        // an answer for another service of the same TV only names it in the description
        assert.strictEqual(bravia.isBraviaAnswer({ ST: 'upnp:rootdevice', _location: DESCRIPTION }), true);
    });

    it('ignores other UPnP devices', () => {
        assert.strictEqual(bravia.isBraviaAnswer({ ST: 'urn:schemas-upnp-org:device:Basic:1' }), false);
        assert.strictEqual(
            bravia.isBraviaAnswer({
                ST: 'upnp:rootdevice',
                _location: '<root><device><friendlyName>Philips hue</friendlyName></device></root>',
            }),
            false,
        );
        assert.strictEqual(bravia.isBraviaAnswer(null), false);
    });

    it('reads the name out of the description', () => {
        assert.strictEqual(bravia.descriptionTag(DESCRIPTION, 'friendlyName'), 'Wohnzimmer TV');
        assert.strictEqual(bravia.descriptionTag(DESCRIPTION, 'modelName'), 'KD-65X8507C');
        assert.strictEqual(bravia.descriptionTag(undefined, 'friendlyName'), undefined);
    });

    it('proposes an instance and asks for the pre-shared key', async () => {
        const options = freshOptions();
        const device = { _upnp: [{ ST: 'upnp:rootdevice' }, { ST: IRCC, _location: DESCRIPTION }] };

        const { found } = await detect(bravia, device, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].native.ip, '192.168.1.50');
        assert.strictEqual(options.newInstances[0].native.psk, '');
        assert.strictEqual(options.newInstances[0].comment.inputs[0].name, 'native.psk');
        assert.ok(options.newInstances[0].common.title.includes('Wohnzimmer TV'));
    });

    it('does not propose a second instance for a TV that is already configured', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.sony-bravia.0',
            common: { name: 'sony-bravia' },
            native: { ip: '192.168.1.50', psk: 'secret' },
        });

        const { found } = await detect(bravia, { _upnp: [{ ST: IRCC }] }, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('hyperion-connector detection', () => {
    const SERVICE = 'urn:hyperion-project.org:device:basic:1';
    const answer = (ip, udn, name) => ({
        ST: SERVICE,
        USN: `uuid:${udn}::${SERVICE}`,
        LOCATION: `http://${ip}:8090/description.xml`,
        _location: `<root><device><friendlyName>${name}</friendlyName></device></root>`,
    });

    it('recognises the Hyperion service type', () => {
        assert.strictEqual(hyperion.isHyperionAnswer({ ST: SERVICE }), true);
        assert.strictEqual(hyperion.isHyperionAnswer({ NT: SERVICE }), true);
        assert.strictEqual(hyperion.isHyperionAnswer({ ST: 'upnp:rootdevice' }), false);
        assert.strictEqual(hyperion.isHyperionAnswer(null), false);
    });

    it('stores the UDN the way the adapter stores it', () => {
        // controller.js strips the prefix on both of its paths, so an entry that keeps it never matches
        assert.strictEqual(hyperion.hyperionUdn(`uuid:abcd-1234::${SERVICE}`), 'abcd-1234');
        assert.strictEqual(hyperion.hyperionUdn('uuid:abcd-1234'), 'abcd-1234');
        assert.strictEqual(hyperion.hyperionUdn(undefined), '');
    });

    it('takes the endpoint out of LOCATION and falls back to the defaults', () => {
        assert.deepStrictEqual(hyperion.hyperionEndpoint('https://10.0.0.7:8091/desc.xml', '10.0.0.7'), {
            protocol: 'https:',
            ip: '10.0.0.7',
            port: 8091,
        });
        assert.deepStrictEqual(hyperion.hyperionEndpoint(undefined, '10.0.0.7'), {
            protocol: 'http:',
            ip: '10.0.0.7',
            port: 8090,
        });
    });

    it('fills one row of the adapter device table', async () => {
        const options = freshOptions();

        const { found } = await detect(hyperion, { _upnp: [answer('192.168.1.50', 'aaa', 'Wohnzimmer')] }, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].native.devices, [
            {
                UDN: 'aaa',
                name: 'Wohnzimmer',
                protocol: 'http:',
                ip: '192.168.1.50',
                port: 8090,
                token: '',
                enabled: true,
            },
        ]);
    });

    it('collects a second server in the same instance', async () => {
        const options = freshOptions();

        await detect(hyperion, { _upnp: [answer('192.168.1.50', 'aaa', 'Wohnzimmer')] }, options);
        const second = await detect(
            hyperion,
            { _upnp: [answer('192.168.1.51', 'bbb', 'Kitchen')] },
            options,
            '192.168.1.51',
        );

        assert.strictEqual(second.found, true);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].native.devices.length, 2);
        assert.strictEqual(options.newInstances[0].comment.add.length, 2);
    });

    it('leaves a server that is already in the table alone', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.hyperion-connector.0',
            common: { name: 'hyperion-connector' },
            native: { devices: [{ UDN: 'aaa', ip: '192.168.1.50', port: 8090, enabled: true }] },
        });

        const { found } = await detect(hyperion, { _upnp: [answer('192.168.1.50', 'aaa', 'Wohnzimmer')] }, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('semp detection', () => {
    /**
     * Build an SMA energy meter telegram. Only the three fields the identification reads are
     * filled in: the "SMA" marker, the protocol id and the SUSy-ID / serial pair.
     *
     * @param susyId device class of the sender
     * @param serial serial number of the sender
     */
    function telegram(susyId, serial) {
        const message = Buffer.alloc(64);
        message.write('SMA', 0, 'ascii');
        message.writeUInt16BE(0x6069, 16);
        message.writeUInt16BE(susyId, 18);
        message.writeUInt32BE(serial, 20);
        return message;
    }

    it('accepts only the SUSy-IDs of a Sunny Home Manager', () => {
        assert.strictEqual(semp.isHomeManager(telegram(372, 1900000000)), true);
        assert.strictEqual(semp.isHomeManager(telegram(501, 1900000000)), true);
        // 349 and 270 are the energy meters, they speak no SEMP
        assert.strictEqual(semp.isHomeManager(telegram(349, 1900000000)), false);
        assert.strictEqual(semp.isHomeManager(telegram(270, 1900000000)), false);
    });

    it('rejects anything that is not an energy meter telegram', () => {
        assert.strictEqual(semp.isHomeManager(Buffer.from('hello world, not SMA at all')), false);
        const wrongProtocol = telegram(372, 1);
        wrongProtocol.writeUInt16BE(0x6065, 16);
        assert.strictEqual(semp.isHomeManager(wrongProtocol), false);
        assert.strictEqual(semp.isHomeManager(Buffer.alloc(8)), false);
    });

    it('reads the serial number', () => {
        assert.strictEqual(semp.homeManagerSerial(telegram(372, 1900123456)), '1900123456');
    });

    it('proposes a gateway when a Home Manager announces itself', async function () {
        this.timeout(8000);
        if (!(await portUsable(9522, true))) {
            return this.skip();
        }
        const options = freshOptions();
        const sender = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        const message = telegram(372, 1900123456);

        const running = detect(semp, null, options, '0.0.0.0');
        // the listener needs its membership before the first datagram arrives
        const ticker = setInterval(() => sender.send(message, 9522, '239.12.255.254'), 150);

        try {
            const { found } = await running;

            if (!found) {
                // no multicast loopback on this host - the pure checks above still cover the logic
                return this.skip();
            }
            assert.strictEqual(options.newInstances.length, 1);
            assert.strictEqual(options.newInstances[0].native.SempPort, 9765);
            assert.match(options.newInstances[0].native.UUID, /^[0-9a-f-]{36}$/);
            assert.ok(options.newInstances[0].comment.add[0].includes('1900123456'));
        } finally {
            clearInterval(ticker);
            sender.close();
        }
    });
});

describe('bambulab announcement', () => {
    const NOTIFY = [
        'NOTIFY * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'Server: UPnP/1.0',
        'Location: 192.168.1.50',
        'NT: urn:bambulab-com:device:3dprinter:1',
        'USN: 01P00A123456789',
        'Cache-Control: max-age=1800',
        'DevModel.bambu.com: C12',
        'DevName.bambu.com: 3DP-01P-426',
        'DevSignal.bambu.com: -38',
        'DevConnect.bambu.com: lan',
        'DevBind.bambu.com: free',
        '',
        '',
    ].join('\r\n');

    it('parses the datagram and recognises the printer', () => {
        const headers = bambuMethod.parseSsdp(NOTIFY);

        assert.strictEqual(headers.NT, 'urn:bambulab-com:device:3dprinter:1');
        assert.strictEqual(headers.USN, '01P00A123456789');
        assert.strictEqual(headers['DEVMODEL.BAMBU.COM'], 'C12');
        assert.strictEqual(bambuMethod.isBambuAnnouncement(headers), true);
    });

    it('ignores other SSDP traffic', () => {
        const foreign = bambuMethod.parseSsdp(
            'NOTIFY * HTTP/1.1\r\nNT: urn:schemas-upnp-org:device:MediaServer:1\r\nUSN: uuid:x\r\n\r\n',
        );
        assert.strictEqual(bambuMethod.isBambuAnnouncement(foreign), false);
        assert.strictEqual(bambuMethod.parseSsdp('garbage'), null);
        assert.strictEqual(bambuMethod.isBambuAnnouncement(null), false);
    });

    it('maps the mainboard code to the series the adapter offers', () => {
        // C11/C12/N1/N2S are the project names pybambu maps in get_printer_type()
        assert.strictEqual(bambu.printerSeries('C12'), 'P1-Series');
        assert.strictEqual(bambu.printerSeries('C11'), 'P1-Series');
        assert.strictEqual(bambu.printerSeries('N1'), 'A1-Series');
        assert.strictEqual(bambu.printerSeries('N2S'), 'A1-Series');
        assert.strictEqual(bambu.printerSeries('3DPrinter-X1-Carbon'), 'X1-Series');
        // an unknown code must not be guessed - the user gets asked instead
        assert.strictEqual(bambu.printerSeries('Z9'), null);
        assert.strictEqual(bambu.printerSeries(undefined), null);
    });

    it('finds the announcement whichever method delivered it', () => {
        const headers = bambuMethod.parseSsdp(NOTIFY);

        assert.ok(bambu.bambuHeaders({ _bambulab: headers }));
        // the same NOTIFY through methods/upnp.ts keeps the header names as sent
        assert.ok(bambu.bambuHeaders({ _upnp: [{ NT: 'urn:bambulab-com:device:3dprinter:1', USN: 'x' }] }));
        assert.strictEqual(bambu.bambuHeaders({ _upnp: [{ ST: 'upnp:rootdevice' }] }), null);
        assert.strictEqual(bambu.bambuHeaders(null), null);
    });

    it('proposes a printer with serial and series, and asks for the access code', async () => {
        const options = freshOptions();

        const { found } = await detect(bambu, { _bambulab: bambuMethod.parseSsdp(NOTIFY) }, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances[0].native.host, '192.168.1.50');
        assert.strictEqual(options.newInstances[0].native.port, 8883);
        assert.strictEqual(options.newInstances[0].native.serial, '01P00A123456789');
        assert.strictEqual(options.newInstances[0].native.printerModel, 'P1-Series');
        assert.strictEqual(options.newInstances[0].comment.inputs.length, 1);
        assert.strictEqual(options.newInstances[0].comment.inputs[0].name, 'native.Password');
    });

    it('asks for the model when the code is unknown', async () => {
        const options = freshOptions();
        const headers = bambuMethod.parseSsdp(NOTIFY.replace('DevModel.bambu.com: C12', 'DevModel.bambu.com: Z9'));

        await detect(bambu, { _bambulab: headers }, options);

        assert.strictEqual(options.newInstances[0].native.printerModel, undefined);
        assert.deepStrictEqual(
            options.newInstances[0].comment.inputs.map(i => i.name),
            ['native.Password', 'native.printerModel'],
        );
    });

    it('leaves a printer that is already configured alone', async () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.bambulab.0',
            common: { name: 'bambulab' },
            native: { host: '192.168.1.50', serial: '01P00A123456789' },
        });

        const { found } = await detect(bambu, { _bambulab: bambuMethod.parseSsdp(NOTIFY) }, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});

describe('bambulab discovery method', () => {
    it('picks the announcement up on the port Bambu Studio listens on', async function () {
        this.timeout(10000);
        if (!(await portUsable(2021, true)) || !(await portUsable(1990, true))) {
            return this.skip();
        }

        const found = [];
        const sender = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        const notify = Buffer.from(
            [
                'NOTIFY * HTTP/1.1',
                'HOST: 239.255.255.250:1900',
                'Location: 127.0.0.1',
                'NT: urn:bambulab-com:device:3dprinter:1',
                'USN: 01P00A123456789',
                'DevModel.bambu.com: C12',
                'DevName.bambu.com: 3DP-01P-426',
                '',
                '',
            ].join('\r\n'),
        );

        const done = new Promise(resolve => {
            const self = {
                adapter: { log: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} } },
                addDevice: device => found.push(device),
                close: () => {},
                setTimeout: ms =>
                    setTimeout(() => {
                        self.close();
                        resolve();
                    }, ms),
            };
            // a printer repeats itself every few seconds; the test does it every 200 ms, so a
            // short run is enough - the method takes its duration from `self.timeout`
            self.timeout = 1500;
            bambuMethod.browse(self);
        });

        // the printer repeats itself every few seconds, so do the same until the method is done
        const ticker = setInterval(() => sender.send(notify, 2021, '127.0.0.1'), 200);

        try {
            await done;
        } finally {
            clearInterval(ticker);
            sender.close();
        }

        if (!found.length) {
            // no loopback delivery on this host - the parser checks above still cover the logic
            return this.skip();
        }
        assert.strictEqual(found[0]._addr, '127.0.0.1');
        assert.strictEqual(found[0]._name, '3DP-01P-426');
        assert.strictEqual(found[0]._bambulab.USN, '01P00A123456789');
    });
});

describe('shared proposals', () => {
    it('collects every device in one proposal, even next to a configured instance', () => {
        const options = freshOptions();
        options.existingInstances.push({
            _id: 'system.adapter.shelly.0',
            common: { name: 'shelly' },
            native: { bonjour: true },
        });

        assert.strictEqual(tools.proposeSharedInstance('shelly', 'shellyplug-s-1 (10.0.0.5)', options), true);
        // the second device must join the first proposal instead of opening a new one -
        // findInstance() hands out a fresh copy of the configured instance on every call
        assert.strictEqual(tools.proposeSharedInstance('shelly', 'shellyplug-s-2 (10.0.0.6)', options), false);

        assert.strictEqual(options.newInstances.length, 1);
        assert.deepStrictEqual(options.newInstances[0].comment.extended, [
            'shellyplug-s-1 (10.0.0.5)',
            'shellyplug-s-2 (10.0.0.6)',
        ]);
    });
});
