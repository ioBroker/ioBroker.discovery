'use strict';

/**
 * Tests for the Homematic detection: hm-rpc and hm-rega, on a classic CCU and on openccu-lite.
 *
 * A classic CCU, RaspberryMatic or OpenCCU answers XML-RPC on its classic ports (2000, 2001,
 * 2010, CUxD on 8701) and has ReGa on 8181. openccu-lite answers its open version path
 * (lib/openccu-lite) and is reached over lite-rpc with a token: it gets hm-rpc instances in
 * openccu-lite mode, no init-based ones - even when its classic RPC is switched on - and no hm-rega.
 *
 * The TCP probes and the openccu-lite probe are replaced by stubs here: the ports are fixed and
 * 80 cannot be bound by a test. The probe itself is covered by test/openccu-lite.test.js.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const lite = require(build('openccu-lite.js'));
const hmRpc = require(build('adapters', 'hm-rpc.js'));
const hmRega = require(build('adapters', 'hm-rega.js'));

const IP = '192.168.1.20';

const VERSION = {
    api: 'meta',
    version: 1,
    capabilities: { pairing: true, apis: { meta: 1, rpc: 1, system: 1, auth: 1 } },
};

const PAIRING_HINT =
    'Pair the instance with the system in its settings - the request is approved on the Status page of openccu-lite';
const NO_PAIRING_HINT =
    'Pairing is switched off on this openccu-lite: create a token on its Remote access page and enter it in the instance settings';

function freshOptions(existingInstances = []) {
    const debug = [];
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: msg => debug.push(msg), info: () => {}, warn: () => {}, error: () => {} },
        debugMessages: debug,
    };
}

function liteSystem(info = VERSION, extra = {}) {
    return { url: `https://${IP}`, https: true, port: 443, info, ...extra };
}

function instance(id, native) {
    return { _id: `system.adapter.hm-rpc.${id}`, common: { name: 'hm-rpc' }, native };
}

/**
 * Replaces the network probes for one test.
 *
 * `open` lists the classic ports that answer, `system` is what the openccu-lite probe finds
 * (`null`: not openccu-lite). `delays` lets a probe answer late, to show that nothing is decided
 * before every answer is in.
 */
function stubNetwork({ open = [], system = null, delays = {} } = {}) {
    const original = { testPort: tools.testPort, probe: lite.probe };
    const calls = { ports: [], probe: [], probeOptions: {} };

    tools.testPort = (ip, port, optionsOrCallback, maybeCallback) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        calls.ports.push(port);
        if (typeof optionsOrCallback === 'object') {
            calls.probeOptions[port] = optionsOrCallback;
        }
        setTimeout(() => callback(null, open.includes(port), ip, port), delays[port] || 0);
    };
    lite.probe = (address, timeout, callback) => {
        calls.probe.push({ address, timeout });
        setTimeout(() => callback(system), delays.lite || 0);
    };

    calls.restore = () => {
        tools.testPort = original.testPort;
        lite.probe = original.probe;
    };
    return calls;
}

function detect(module, options, device = { _addr: IP, _name: IP }, ip = IP) {
    return new Promise(resolve => {
        let calls = 0;
        module.detect(ip, device, options, (err, found, addr) => {
            calls++;
            setTimeout(() => resolve({ err, found, addr, calls }), 30);
        });
    });
}

describe('hm-rpc on a classic CCU', () => {
    let network;
    afterEach(() => network?.restore());

    it('proposes one instance per answering daemon, exactly as before', async () => {
        network = stubNetwork({ open: [2000, 2001, 8701, 2010] });
        const options = freshOptions();
        const { err, found, addr, calls } = await detect(hmRpc, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(addr, IP);
        assert.strictEqual(calls, 1);
        const own = tools.getOwnAddress(IP);
        assert.deepStrictEqual(options.newInstances, [
            {
                _id: 'system.adapter.hm-rpc.0',
                common: { name: 'hm-rpc', title: `HomeMatic hs485d (${IP})` },
                native: {
                    homematicAddress: IP,
                    adapterAddress: own,
                    homematicPort: 2000,
                    port: 12000,
                    type: 'bin',
                    daemon: 'hs485d',
                },
                comment: { add: [`hs485d (${IP})`] },
            },
            {
                _id: 'system.adapter.hm-rpc.1',
                common: { name: 'hm-rpc', title: `HomeMatic Wireless (${IP})` },
                native: {
                    homematicAddress: IP,
                    adapterAddress: own,
                    homematicPort: 2001,
                    port: 12001,
                    type: 'bin',
                    daemon: 'rfd',
                },
                comment: { add: [`Wireless RF (${IP})`] },
            },
            {
                _id: 'system.adapter.hm-rpc.2',
                common: { name: 'hm-rpc', title: `HomeMatic CuxD (${IP})` },
                native: {
                    homematicAddress: IP,
                    adapterAddress: own,
                    homematicPort: 8701,
                    port: 18701,
                    type: 'bin',
                    daemon: 'CUxD',
                },
                comment: { add: [`CUxD (${IP})`] },
            },
            {
                _id: 'system.adapter.hm-rpc.3',
                common: { name: 'hm-rpc', title: `HomeMatic HMIP (${IP})` },
                native: {
                    homematicAddress: IP,
                    adapterAddress: own,
                    homematicPort: 2010,
                    port: 12010,
                    type: 'xml',
                    daemon: 'HMIP',
                },
                comment: { add: [`HMIP (${IP})`] },
            },
        ]);
    });

    it('asks every classic port and the openccu-lite probe, all at once', async () => {
        network = stubNetwork();
        await detect(hmRpc, freshOptions());

        assert.deepStrictEqual(network.ports.sort(), [2000, 2001, 2010, 8701]);
        assert.deepStrictEqual(network.probe, [{ address: IP, timeout: 2000 }]);
        // CUxD is a plain port test, the other three are asked for their version
        assert.deepStrictEqual(Object.keys(network.probeOptions).map(Number).sort(), [2000, 2001, 2010]);
    });

    it('asks the daemons for their version and takes a version as the answer', async () => {
        network = stubNetwork();
        await detect(hmRpc, freshOptions());

        const { onConnect, onReceive } = network.probeOptions[2001];
        const written = [];
        onConnect(IP, 2001, { write: data => written.push(data) });
        assert.strictEqual(written.length, 1);
        assert.match(written[0], /^POST \/ HTTP\/1\.1\r\n/);
        assert.match(written[0], new RegExp(`Host: ${IP.replace(/\./g, '\\.')}:2001\\r\\n`));
        assert.match(written[0], /<methodName>getVersion<\/methodName>/);
        const body = written[0].split('\r\n\r\n')[1];
        assert.strictEqual(Buffer.byteLength(body), 98);

        assert.strictEqual(onReceive(Buffer.from('<value>2.6.8</value>')), true);
        assert.strictEqual(onReceive(Buffer.from('<!DOCTYPE html><title>HomeMatic</title>')), false);
        assert.strictEqual(onReceive(Buffer.from('<fault><value><i4>-1</i4></value></fault>')), false);
    });

    it('proposes nothing where no daemon answers', async () => {
        network = stubNetwork();
        const options = freshOptions();
        const { err, found } = await detect(hmRpc, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, false);
        assert.deepStrictEqual(options.newInstances, []);
    });

    it('proposes nothing for a daemon that already has an instance, by address or by name', async () => {
        network = stubNetwork({ open: [2001, 2010] });
        const options = freshOptions([instance(0, { homematicAddress: IP, homematicPort: 2001, daemon: 'rfd' })]);
        options.newInstances.push(instance(1, { homematicAddress: 'ccu.local', homematicPort: 2010, daemon: 'HMIP' }));
        const { found } = await detect(hmRpc, options, { _addr: IP, _name: 'ccu.local' });

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 1);
    });

    it('names the device in the title when it has a name of its own', async () => {
        network = stubNetwork({ open: [2010] });
        const options = freshOptions();
        await detect(hmRpc, options, { _addr: IP, _name: 'ccu3' });

        assert.strictEqual(options.newInstances[0].common.title, `HomeMatic HMIP (${IP} - ccu3)`);
    });

    it('waits for a late openccu-lite answer before it proposes anything', async () => {
        network = stubNetwork({ open: [2001], delays: { lite: 40 } });
        const options = freshOptions();
        const { found, calls } = await detect(hmRpc, options);

        assert.strictEqual(found, true);
        assert.strictEqual(calls, 1);
        assert.strictEqual(options.newInstances[0].native.daemon, 'rfd');
    });

    it('keeps budget for the openccu-lite probe and looks at IP devices', () => {
        assert.deepStrictEqual(hmRpc.type, ['ip']);
        assert.ok(hmRpc.timeout > 2000, 'the watchdog must not win against the probe');
    });
});

describe('hm-rpc on openccu-lite', () => {
    let network;
    afterEach(() => network?.restore());

    it('proposes HmIP-RF and BidCos-RF in openccu-lite mode when no interface can be seen', async () => {
        network = stubNetwork({ system: liteSystem() });
        const options = freshOptions();
        const { err, found, calls } = await detect(hmRpc, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(calls, 1);
        assert.deepStrictEqual(options.newInstances, [
            {
                _id: 'system.adapter.hm-rpc.0',
                common: { name: 'hm-rpc', title: `HomeMatic HmIP-RF (openccu-lite, ${IP})` },
                native: {
                    daemon: 'openccu-lite',
                    homematicAddress: IP,
                    homematicPort: 443,
                    useHttps: true,
                    type: 'xml',
                    liteInterface: 'HmIP-RF',
                },
                comment: { add: [`HmIP-RF (openccu-lite, ${IP})`], text: PAIRING_HINT },
            },
            {
                _id: 'system.adapter.hm-rpc.1',
                common: { name: 'hm-rpc', title: `HomeMatic BidCos-RF (openccu-lite, ${IP})` },
                native: {
                    daemon: 'openccu-lite',
                    homematicAddress: IP,
                    homematicPort: 443,
                    useHttps: true,
                    type: 'xml',
                    liteInterface: 'BidCos-RF',
                },
                comment: { add: [`BidCos-RF (openccu-lite, ${IP})`], text: PAIRING_HINT },
            },
        ]);
        assert.deepStrictEqual(hmRpc.DEFAULT_LITE_INTERFACES, ['HmIP-RF', 'BidCos-RF']);
        assert.strictEqual(hmRpc.LITE_DAEMON, 'openccu-lite');
    });

    it('proposes no init-based instance when classic RPC is switched on - the open ports name the interfaces', async () => {
        network = stubNetwork({ open: [2000, 2001, 8701, 2010], system: liteSystem() });
        const options = freshOptions();
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['BidCos-Wired', 'BidCos-RF', 'HmIP-RF'],
        );
        for (const proposal of options.newInstances) {
            assert.strictEqual(proposal.native.daemon, 'openccu-lite');
            assert.strictEqual(proposal.native.port, undefined, 'no callback port: there is no init');
            assert.strictEqual(proposal.native.adapterAddress, undefined);
        }
    });

    it('takes only the interfaces whose port answered', async () => {
        network = stubNetwork({ open: [2010], system: liteSystem() });
        const options = freshOptions();
        await detect(hmRpc, options);

        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['HmIP-RF'],
        );
    });

    it('fills in plain HTTP where the system answered without the redirect', async () => {
        network = stubNetwork({ system: liteSystem(VERSION, { url: `http://${IP}`, https: false, port: 80 }) });
        const options = freshOptions();
        await detect(hmRpc, options);

        assert.strictEqual(options.newInstances[0].native.useHttps, false);
        assert.strictEqual(options.newInstances[0].native.homematicPort, 80);
    });

    it('says how to get a token when the system has pairing switched off', async () => {
        const info = { ...VERSION, capabilities: { ...VERSION.capabilities, pairing: false } };
        network = stubNetwork({ system: liteSystem(info) });
        const options = freshOptions();
        await detect(hmRpc, options);

        assert.strictEqual(options.newInstances.length, 2);
        for (const proposal of options.newInstances) {
            assert.strictEqual(proposal.comment.text, NO_PAIRING_HINT);
        }
    });

    it('proposes for a system from before the capabilities were in the answer', async () => {
        network = stubNetwork({ system: liteSystem({ api: 'meta', version: 1 }) });
        const options = freshOptions();
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, true);
        assert.strictEqual(options.newInstances.length, 2);
        assert.strictEqual(options.newInstances[0].comment.text, PAIRING_HINT);
    });

    it('proposes nothing - and nothing classic - for a lite-rpc major hm-rpc does not speak', async () => {
        const info = { ...VERSION, capabilities: { apis: { rpc: 2 } } };
        network = stubNetwork({ open: [2001], system: liteSystem(info) });
        const options = freshOptions();
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(options.newInstances, []);
        assert.deepStrictEqual(options.debugMessages, [
            `openccu-lite at ${IP} speaks lite-rpc 2, which hm-rpc does not know yet`,
        ]);
    });

    it('proposes exactly the interfaces the system names in its version answer', async () => {
        const info = { ...VERSION, interfaces: ['BidCos-RF', 'HmIP-RF', 'VirtualDevices'] };
        // the classic ports say something else - the system's own list wins
        network = stubNetwork({ open: [2000, 2010], system: liteSystem(info) });
        const options = freshOptions();
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(
            options.newInstances.map(i => [i.common.title, i.native.liteInterface, i.native.daemon]),
            [
                [`HomeMatic BidCos-RF (openccu-lite, ${IP})`, 'BidCos-RF', 'openccu-lite'],
                [`HomeMatic HmIP-RF (openccu-lite, ${IP})`, 'HmIP-RF', 'openccu-lite'],
                [`HomeMatic VirtualDevices (openccu-lite, ${IP})`, 'VirtualDevices', 'openccu-lite'],
            ],
        );
    });

    it('proposes nothing for a system that names no interface', async () => {
        network = stubNetwork({ open: [2010], system: liteSystem({ ...VERSION, interfaces: [] }) });
        const options = freshOptions();
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(options.newInstances, []);
    });

    it('takes a classic heating-group instance as covering VirtualDevices', async () => {
        network = stubNetwork({ system: liteSystem({ ...VERSION, interfaces: ['HmIP-RF', 'VirtualDevices'] }) });
        const options = freshOptions([
            instance(0, { homematicAddress: IP, homematicPort: 9292, daemon: 'virtual-devices' }),
        ]);
        await detect(hmRpc, options);

        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['HmIP-RF'],
        );
    });

    it('proposes an interface hm-rpc has no classic daemon for, whatever classic instances exist', async () => {
        network = stubNetwork({ system: liteSystem({ ...VERSION, interfaces: ['Future-IF'] }) });
        const options = freshOptions([instance(0, { homematicAddress: IP, homematicPort: 2010, daemon: 'HMIP' })]);
        await detect(hmRpc, options);

        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['Future-IF'],
        );
    });

    it('proposes no interface twice - an instance in openccu-lite mode covers it', async () => {
        network = stubNetwork({ system: liteSystem() });
        const options = freshOptions([
            instance(0, { daemon: 'openccu-lite', homematicAddress: IP, liteInterface: 'HmIP-RF' }),
        ]);
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['BidCos-RF'],
        );
        assert.strictEqual(options.newInstances[0]._id, 'system.adapter.hm-rpc.1');
    });

    it('proposes no interface twice - a classic instance for the same daemon covers it too', async () => {
        network = stubNetwork({ system: liteSystem() });
        const options = freshOptions([
            instance(0, { homematicAddress: 'lite.local', homematicPort: 2001, daemon: 'rfd' }),
        ]);
        await detect(hmRpc, options, { _addr: IP, _name: 'lite.local' });

        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['HmIP-RF'],
        );
    });

    it('is not put off by instances of other systems or other interfaces', async () => {
        network = stubNetwork({ system: liteSystem() });
        const options = freshOptions([
            instance(0, { daemon: 'openccu-lite', homematicAddress: '192.168.1.99', liteInterface: 'HmIP-RF' }),
            instance(1, { daemon: 'openccu-lite', homematicAddress: IP, liteInterface: 'BidCos-Wired' }),
            instance(2, { homematicAddress: IP, homematicPort: 2000, daemon: 'hs485d' }),
        ]);
        await detect(hmRpc, options);

        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['HmIP-RF', 'BidCos-RF'],
        );
    });

    it('reports no find when every interface is covered already', async () => {
        network = stubNetwork({ system: liteSystem() });
        const options = freshOptions([
            instance(0, { daemon: 'openccu-lite', homematicAddress: IP, liteInterface: 'HmIP-RF' }),
            instance(1, { daemon: 'openccu-lite', homematicAddress: IP, liteInterface: 'BidCos-RF' }),
        ]);
        const { found } = await detect(hmRpc, options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(options.newInstances, []);
    });

    it('waits for the slowest classic port before it decides', async () => {
        network = stubNetwork({ open: [2010], system: liteSystem(), delays: { 2010: 40 } });
        const options = freshOptions();
        const { calls } = await detect(hmRpc, options);

        assert.strictEqual(calls, 1);
        assert.deepStrictEqual(
            options.newInstances.map(i => i.native.liteInterface),
            ['HmIP-RF'],
        );
    });
});

describe('hm-rega', () => {
    let network;
    afterEach(() => network?.restore());

    it('proposes nothing for openccu-lite, without asking 8181', async () => {
        network = stubNetwork({ open: [8181] });
        const options = freshOptions();
        options.newInstances.push(
            instance(0, { daemon: 'openccu-lite', homematicAddress: IP, liteInterface: 'HmIP-RF' }),
        );
        const { err, found, addr, calls } = await detect(hmRega, options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, false);
        assert.strictEqual(addr, IP);
        assert.strictEqual(calls, 1);
        assert.deepStrictEqual(network.ports, []);
        assert.strictEqual(options.newInstances.length, 1);
    });

    it('knows an openccu-lite instance that exists already, by its name as well', async () => {
        network = stubNetwork({ open: [8181] });
        const options = freshOptions([
            instance(0, { daemon: 'openccu-lite', homematicAddress: 'lite.local', liteInterface: 'HmIP-RF' }),
        ]);
        const { found } = await detect(hmRega, options, { _addr: IP, _name: 'lite.local' });

        assert.strictEqual(found, false);
        assert.deepStrictEqual(network.ports, []);
    });

    it('still proposes ReGa on a classic CCU next to the proposed hm-rpc instance', async () => {
        network = stubNetwork({ open: [8181] });
        const options = freshOptions([
            instance(5, { daemon: 'openccu-lite', homematicAddress: '192.168.1.99', liteInterface: 'HmIP-RF' }),
        ]);
        options.newInstances.push(instance(0, { homematicAddress: IP, homematicPort: 2001, daemon: 'rfd' }));
        const { found } = await detect(hmRega, options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(network.ports, [8181]);
        const rega = options.newInstances.find(i => i.common.name === 'hm-rega');
        assert.strictEqual(rega.native.homematicAddress, IP);
        assert.strictEqual(rega.native.rfdEnabled, true);
        assert.strictEqual(rega.native.rfdAdapter, 'hm-rpc.0');
    });

    it('proposes nothing where 8181 is closed', async () => {
        network = stubNetwork();
        const options = freshOptions();
        options.newInstances.push(instance(0, { homematicAddress: IP, homematicPort: 2001, daemon: 'rfd' }));
        const { found } = await detect(hmRega, options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 1);
    });
});
