'use strict';

/**
 * Tests for the faikout detection module.
 *
 * The record shapes are those the mdns method delivered (merged by the core) for three real Faikout
 * modules, for other web servers in the same network and for a UniFi gateway reflecting their answers.
 * A module announces only `_http._tcp` under the name the user gave it, without a TXT record, so the
 * footer of its start page is what identifies it. The probe is replaced by a stub - no test touches
 * the network.
 */

const assert = require('node:assert');
const path = require('node:path');

const build = (...parts) => path.join('..', '..', 'build', 'lib', ...parts);
const tools = require(build('tools.js'));
const faikout = require(build('adapters', 'faikout.js'));

// The end of the start page as a module with firmware f4ba4a82 sends it (Daikin, S21 protocol)
const daikinPage =
    "<!DOCTYPE html><meta name='viewport' content='width=device-width, initial-scale=.75'><title>Daikin 1OG</title>" +
    '<body><h1>Daikin 1OG</h1><div id=top class=off></div><script>c();</script>' +
    '<hr><address><a href=/revk-settings?_page=0>Settings</a> Faikout<small>-S3-MINI-N4-R2</small>: f4ba4a82 2026-10-11T08:15:45 <b>S21</b></address></body></html>';
// A module driving a TCL unit over IR (a build of the same project with its own version)
const irPage =
    "<!DOCTYPE html><meta name='viewport' content='width=device-width, initial-scale=.75'><title>TCL_Ferienhaus</title>" +
    '<hr><address><a href=/revk-settings?_page=0>Settings</a> Faikout<small>-S3-MINI-N4-R2</small>: tcl-ea64592 2026-11-15T19:00:43 <b>TCL-IR</b></address></body></html>';
// Web control switched off: `/` shows the settings page, whose footer has no protocol
const settingsPage =
    '<!DOCTYPE html><title>Settings</title><h1>Settings</h1>' +
    '<hr><address><a href=/>Home</a> Faikout<small>-S3-MINI-N4-R2</small>: f4ba4a82 2026-10-11T08:15:45</address></body></html>';
// Firmware from before the rename
const faikinPage =
    '<!DOCTYPE html><title>Office</title><hr><address><a href=/revk-settings>Settings</a> Faikin<small>-S3-MINI-N4-R2</small>: 2f8e3b1 2024-11-02T10:01:12 <b>S21</b></address></body></html>';
// Another firmware of the same author: same library, same footer, different application
const otherRevkPage =
    '<!DOCTYPE html><title>Garden</title><hr><address><a href=/revk-settings>Settings</a> SolarGarden<small>-S3-MINI-N4-R2</small>: 1a2b3c4 2026-05-01T12:00:00</address></body></html>';

let pages;
let probed;
const originalHttpGet = tools.httpGet;

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** A module as the mdns method reports it: `_http._tcp` and its instance name, nothing else */
function module(ip, name) {
    return {
        _addr: ip,
        _name: '_http._tcp.local',
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            ip,
            type: 'answer',
            name: '_http._tcp.local',
            PTR: {
                name: '_http._tcp.local',
                data: `${name}._http._tcp.local`,
                namex: ['_services._dns-sd._udp.local', '_http._tcp.local'],
                datax: ['_http._tcp.local', `${name}._http._tcp.local`],
            },
            namex: ['_services._dns-sd._udp.local', '_http._tcp.local'],
        },
    };
}

/** A module of which only the service enumeration came in, as seen for one of the three */
function moduleWithoutInstance(ip) {
    return {
        _addr: ip,
        _name: '_services._dns-sd._udp.local',
        _type: 'mdns',
        _source: 'mdns',
        _mdns: {
            ip,
            type: 'answer',
            name: '_services._dns-sd._udp.local',
            PTR: { name: '_services._dns-sd._udp.local', data: '_http._tcp.local' },
        },
    };
}

function detect(device, options) {
    return new Promise(resolve => {
        faikout.detect(device._addr, device, options, (err, found, addr) => resolve({ err, found, addr }));
    });
}

describe('faikout detection', () => {
    beforeEach(() => {
        pages = {
            'http://192.168.1.70/': daikinPage,
            'http://192.168.1.71/': daikinPage.replace(/Daikin 1OG/g, 'Daikin Wohnzimmer'),
            'http://192.168.1.72/': irPage,
        };
        probed = [];
        tools.httpGet = (link, timeout, callback) => {
            assert.strictEqual(callback, undefined, 'the module uses the promise form');
            assert.ok(timeout > 0 && timeout < faikout.timeout, 'the probe must end before the watchdog');
            probed.push(link);
            const body = pages[link];
            return body ? Promise.resolve(body) : Promise.reject(new Error('ECONNREFUSED'));
        };
    });

    afterEach(() => {
        tools.httpGet = originalHttpGet;
    });

    it('recognises a module on a Daikin unit by the footer of its start page', async () => {
        const options = freshOptions();

        const { err, found, addr } = await detect(module('192.168.1.70', 'Daikin 1OG'), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, true);
        assert.strictEqual(addr, '192.168.1.70');
        assert.deepStrictEqual(probed, ['http://192.168.1.70/']);
        assert.strictEqual(options.newInstances.length, 1);
        const proposal = options.newInstances[0];
        assert.strictEqual(proposal._id, 'system.adapter.faikout.0');
        assert.strictEqual(proposal.common.name, 'faikout');
        // nothing pre-filled: the adapter defaults are right for 0.1.x and 1.x alike
        assert.deepStrictEqual(proposal.native, {});
        assert.deepStrictEqual(proposal.comment.add, ['Daikin 1OG (192.168.1.70), Faikout f4ba4a82, S21']);
    });

    it('recognises a module of which only the service enumeration was seen', async () => {
        const options = freshOptions();

        const { found } = await detect(moduleWithoutInstance('192.168.1.71'), options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, [
            'Daikin Wohnzimmer (192.168.1.71), Faikout f4ba4a82, S21',
        ]);
    });

    it('recognises a module driving an IR air conditioner by the same footer', async () => {
        const options = freshOptions();

        const { found } = await detect(module('192.168.1.72', 'TCL_Ferienhaus'), options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, [
            'TCL_Ferienhaus (192.168.1.72), Faikout tcl-ea64592, TCL-IR',
        ]);
    });

    it('takes the mDNS name when the start page is the settings page', async () => {
        pages['http://192.168.1.73/'] = settingsPage;
        const options = freshOptions();

        const { found } = await detect(module('192.168.1.73', 'Bedroom'), options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Bedroom (192.168.1.73), Faikout f4ba4a82']);
    });

    it('recognises the firmware under its former name Faikin', async () => {
        pages['http://192.168.1.74/'] = faikinPage;
        const options = freshOptions();

        const { found } = await detect(module('192.168.1.74', 'Office'), options);

        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].comment.add, ['Office (192.168.1.74), Faikin 2f8e3b1, S21']);
    });

    it('proposes one instance for all modules', async () => {
        const options = freshOptions();

        const one = await detect(module('192.168.1.70', 'Daikin 1OG'), options);
        const two = await detect(moduleWithoutInstance('192.168.1.71'), options);
        const three = await detect(module('192.168.1.72', 'TCL_Ferienhaus'), options);

        assert.strictEqual(one.found, true);
        assert.strictEqual(two.found, false);
        assert.strictEqual(three.found, false);
        assert.strictEqual(options.newInstances.length, 1);
        assert.strictEqual(options.newInstances[0].comment.add.length, 3);
    });

    it('does not take other firmware of the same author for a module', async () => {
        pages['http://192.168.1.75/'] = otherRevkPage;
        const options = freshOptions();

        const { found } = await detect(module('192.168.1.75', 'Garden'), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores a web server that announces only _http._tcp but is no module', async () => {
        // a Tibber Pulse bridge announces exactly like a module; its page has no RevK footer
        pages['http://192.168.1.42/'] = '<html><head><title>Tibber Bridge</title></head><body>Login</body></html>';
        const options = freshOptions();

        const { found } = await detect(module('192.168.1.42', 'Tibber Bridge Web Server'), options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, ['http://192.168.1.42/']);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('ignores a device that does not answer', async () => {
        const options = freshOptions();

        const { err, found } = await detect(module('192.168.1.91', 'gone'), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });

    it('gives up on a server that does not finish its answer in time', async function () {
        this.timeout(faikout.timeout + 1000);
        // a NAS that kept the request open for 5 s although httpGet's idle timeout was shorter
        tools.httpGet = () => new Promise(() => {});
        const options = freshOptions();
        const started = Date.now();

        const { err, found } = await detect(module('192.168.1.90', 'NAS'), options);

        assert.strictEqual(err, null);
        assert.strictEqual(found, false);
        assert.ok(Date.now() - started < faikout.timeout, 'the module must answer before the watchdog');
    });

    it('does not probe a device that announces other services too', async () => {
        const options = freshOptions();
        // a Shelly Plus Plug S: _shelly._tcp and _http._tcp
        const shelly = module('192.168.1.120', 'PlusPlugS-Waschmaschiene');
        shelly._mdns.PTR.datax.push('_shelly._tcp.local', 'PlusPlugS-Waschmaschiene._shelly._tcp.local');
        shelly._mdns.PTR.namex.push('_shelly._tcp.local');

        const { found } = await detect(shelly, options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, []);
    });

    it('does not probe a web server that announces a TXT record', async () => {
        const options = freshOptions();
        // a managed switch: only _http._tcp, but with TXT data (here as the merged object the core hands over)
        const sw = module('192.168.1.129', 'switch6b2d74');
        sw._mdns.TXT = { name: 'switch6b2d74._http._tcp.local', data: { 0: 6, 1: 116, 2: 121, 3: 112, 4: 101 } };
        const viaBuffer = module('192.168.1.130', 'WiNet-WebServer');
        viaBuffer._mdns.TXT = { name: 'WiNet-WebServer._http._tcp.local', data: Buffer.from('\x0ainverter=1') };

        assert.strictEqual((await detect(sw, options)).found, false);
        assert.strictEqual((await detect(viaBuffer, options)).found, false);
        assert.deepStrictEqual(probed, []);
    });

    it('still asks a device with an empty TXT record', async () => {
        const options = freshOptions();
        const device = module('192.168.1.70', 'Daikin 1OG');
        device._mdns.TXT = { name: 'Daikin 1OG._http._tcp.local', data: Buffer.from([0]) };

        const { found } = await detect(device, options);

        assert.strictEqual(found, true);
    });

    it('does not probe devices without _http._tcp', async () => {
        const options = freshOptions();
        const miele = module('192.168.1.80', 'Miele G5840');
        miele._mdns.PTR = {
            name: '_mieleathome._tcp.local',
            data: 'Miele G5840._mieleathome._tcp.local',
            namex: ['_services._dns-sd._udp.local', '_mieleathome._tcp.local'],
            datax: ['_mieleathome._tcp.local', 'Miele G5840._mieleathome._tcp.local'],
        };
        miele._mdns.A = { name: 'Miele-001D63FFFE3F0B30.local', data: '192.168.1.80' };

        const { found } = await detect(miele, options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, []);
    });

    it('does not take an mDNS reflector for a module', async () => {
        const options = freshOptions();
        // A UniFi gateway repeating the module's answers - including its A record - from its own address
        const reflector = module('192.168.1.1', 'Daikin 1OG');
        reflector._mdns.A = { name: 'Daikin 1OG.local', data: '192.168.1.70' };

        const { found } = await detect(reflector, options);

        assert.strictEqual(found, false);
        assert.deepStrictEqual(probed, []);
    });

    it('leaves a configured instance alone and does not ask the modules', async () => {
        const options = freshOptions([
            { _id: 'system.adapter.faikout.0', common: { name: 'faikout' }, native: { port: 1888 } },
        ]);

        const { found } = await detect(module('192.168.1.70', 'Daikin 1OG'), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
        assert.deepStrictEqual(probed, []);
    });

    it('leaves every further configured instance alone too', async () => {
        const options = freshOptions([
            { _id: 'system.adapter.faikout.1', common: { name: 'faikout' }, native: { port: 1889 } },
            { _id: 'system.adapter.faikout.2', common: { name: 'faikout' }, native: {} },
        ]);

        const { found } = await detect(module('192.168.1.70', 'Daikin 1OG'), options);

        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
        assert.deepStrictEqual(probed, []);
    });

    it('works on mDNS devices only', () => {
        assert.deepStrictEqual(faikout.type, ['mdns']);
    });
});
