'use strict';

/**
 * Tests for issue #247: in an unprivileged LXC container ping may not open its socket, every
 * address of the range answers "not alive" and the scan finds nothing but localhost.
 *
 * The parts that decide what happens then live in lib/methods/ping/fallback and in the
 * stderr classification of lib/methods/ping/ping, so that they can be checked without a
 * network and without a container.
 */

const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');

const ping = require(path.join('..', 'build', 'lib', 'methods', 'ping', 'ping.js'));
const fallback = require(path.join('..', 'build', 'lib', 'methods', 'ping', 'fallback.js'));

describe('ping stderr: may we send ICMP at all', () => {
    it('recognises what an unprivileged container answers', () => {
        // iputils, the case of the issue
        assert.strictEqual(ping.isPermissionError('ping: socket: Operation not permitted'), true);
        // older iputils
        assert.strictEqual(ping.isPermissionError('ping: icmp open socket: Operation not permitted'), true);
        // busybox, e.g. an alpine container
        assert.strictEqual(ping.isPermissionError('ping: permission denied (are you root?)'), true);
        // a local firewall dropping our echo request - ping is unusable here as well
        assert.strictEqual(ping.isPermissionError('ping: sendmsg: Operation not permitted'), true);
    });

    it('does not confuse an offline host with a missing permission', () => {
        assert.strictEqual(ping.isPermissionError(''), false);
        assert.strictEqual(ping.isPermissionError(undefined), false);
        assert.strictEqual(ping.isPermissionError('From 192.168.1.1 icmp_seq=1 Destination Host Unreachable'), false);
        assert.strictEqual(ping.isPermissionError('ping: unknown host'), false);
    });
});

describe('what a refused connection says', () => {
    it('counts an answer as proof that somebody is there', () => {
        // both come from the host itself, so it exists
        assert.strictEqual(fallback.classifyConnectError('ECONNREFUSED'), 'alive');
        assert.strictEqual(fallback.classifyConnectError('ECONNRESET'), 'alive');
    });

    it('keeps silence as silence', () => {
        for (const code of ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EACCES', undefined]) {
            assert.strictEqual(fallback.classifyConnectError(code), 'unknown', String(code));
        }
    });
});

describe('the port list of the fallback', () => {
    it('reads what the settings carry', () => {
        assert.deepStrictEqual(fallback.parsePorts('80,443, 8080'), [80, 443, 8080]);
        assert.deepStrictEqual(fallback.parsePorts('80;443 22'), [80, 443, 22]);
        assert.deepStrictEqual(fallback.parsePorts([80, 443]), [80, 443]);
    });

    it('drops what is not a port and keeps every port once', () => {
        assert.deepStrictEqual(fallback.parsePorts('80,80,0,65536,-1,http'), [80]);
    });

    it('falls back to the defaults when nothing usable is configured', () => {
        assert.deepStrictEqual(fallback.parsePorts(''), fallback.DEFAULT_TCP_PORTS);
        assert.deepStrictEqual(fallback.parsePorts(undefined), fallback.DEFAULT_TCP_PORTS);
        assert.deepStrictEqual(fallback.parsePorts('nothing here'), fallback.DEFAULT_TCP_PORTS);
    });

    it('hands out a copy, so that a caller cannot edit the defaults', () => {
        const ports = fallback.parsePorts('');
        ports.push(1);
        assert.ok(!fallback.DEFAULT_TCP_PORTS.includes(1));
    });
});

describe('the hint in the log', () => {
    it('names both repairs and the reason ping gave', () => {
        const lines = fallback.deniedHint('ping: socket: Operation not permitted', [80, 443]).join('\n');
        assert.ok(lines.includes('ping: socket: Operation not permitted'), lines);
        assert.ok(lines.includes('setcap cap_net_raw+ep'), lines);
        assert.ok(lines.includes('ping_group_range'), lines);
        assert.ok(lines.includes('80, 443'), lines);
    });

    it('says that nothing will be scanned when the fallback is off', () => {
        const lines = fallback.deniedHint('ping: socket: Operation not permitted').join('\n');
        assert.ok(lines.includes('skipped'), lines);
    });

    it('copes with a ping that said nothing at all', () => {
        assert.strictEqual(fallback.deniedHint(undefined, [80]).length, 3);
    });
});

describe('the TCP probe', () => {
    let server;
    let port;

    before(done => {
        server = net.createServer(socket => socket.end());
        server.listen(0, '127.0.0.1', () => {
            port = server.address().port;
            done();
        });
    });

    after(done => server.close(done));

    it('finds a host by an open port', done => {
        fallback.probeTcp('127.0.0.1', [port], 2000, (alive, answeredOn) => {
            assert.strictEqual(alive, true);
            assert.strictEqual(answeredOn, port);
            done();
        });
    });

    it('finds a host that only refuses the connection', done => {
        // the server does not listen there, so the loopback answers with a reset
        fallback.probeTcp('127.0.0.1', [1], 2000, alive => {
            assert.strictEqual(alive, true);
            done();
        });
    });

    it('tries every port and takes the one that answers', done => {
        fallback.probeTcp('127.0.0.1', [port, 1], 2000, alive => {
            assert.strictEqual(alive, true);
            done();
        });
    });

    it('answers once, not once per port', done => {
        let calls = 0;
        fallback.probeTcp('127.0.0.1', [port, port, 1], 2000, () => calls++);
        setTimeout(() => {
            assert.strictEqual(calls, 1);
            done();
        }, 500);
    });

    it('gives up on an address nobody answers for', done => {
        // TEST-NET-1 (RFC 5737) is not routed anywhere
        fallback.probeTcp('192.0.2.1', [80], 300, alive => {
            assert.strictEqual(alive, false);
            done();
        });
    }).timeout(5000);

    it('says "nobody" when there is no port to try', done => {
        fallback.probeTcp('127.0.0.1', [], 2000, alive => {
            assert.strictEqual(alive, false);
            done();
        });
    });
});

describe('the ping method on a host that may not send ICMP', () => {
    const pingMethod = require(path.join('..', 'build', 'lib', 'methods', 'ping.js'));
    const os = require('node:os');

    const realProbe = ping.probe;
    const realProbeTcp = fallback.probeTcp;
    const realInterfaces = os.networkInterfaces;

    // one address to look at: 192.0.2.1/30 leaves 192.0.2.2 after the own address is skipped
    const range = {
        eth0: [{ family: 'IPv4', internal: false, address: '192.0.2.1', netmask: '255.255.255.252' }],
    };

    /** Everything the method touches of a MethodInstance */
    function fakeSelf(options) {
        const self = {
            options: Object.assign({ pingTimeout: 1000, pingBlock: 20 }, options),
            halt: {},
            found: [],
            warnings: [],
            addDevice(device) {
                self.found.push(device);
            },
            get() {
                return undefined;
            },
            updateProgress() {},
            adapter: {
                log: {
                    debug() {},
                    info() {},
                    warn(text) {
                        self.warnings.push(text);
                    },
                    error(text) {
                        self.warnings.push(text);
                    },
                },
            },
        };
        return self;
    }

    function browse(options, callback) {
        const self = fakeSelf(options);
        self.done = () => callback(self);
        pingMethod.browse(self);
    }

    beforeEach(() => {
        os.networkInterfaces = () => JSON.parse(JSON.stringify(range));
    });

    afterEach(() => {
        os.networkInterfaces = realInterfaces;
        ping.probe = realProbe;
        fallback.probeTcp = realProbeTcp;
    });

    it('sweeps the range over TCP instead of reporting an empty network', function (done) {
        this.timeout(10000);
        const asked = [];
        ping.probe = (addr, config, cb) =>
            setImmediate(cb, null, {
                host: addr,
                alive: false,
                ms: undefined,
                error: 'ping: socket: Operation not permitted',
                denied: true,
            });
        fallback.probeTcp = (ip, ports, timeout, cb) => {
            asked.push(ip);
            setImmediate(cb, ip === '192.0.2.2', 80);
        };

        browse({}, self => {
            assert.deepStrictEqual(asked, ['192.0.2.2']);
            assert.deepStrictEqual(
                self.found.map(d => d._addr),
                ['127.0.0.1', '192.0.2.2'],
            );
            assert.ok(
                self.warnings.some(w => w.includes('setcap cap_net_raw+ep')),
                self.warnings.join('\n'),
            );
            done();
        });
    });

    it('says it once, however many addresses are denied', function (done) {
        this.timeout(10000);
        ping.probe = (addr, config, cb) =>
            setImmediate(cb, null, {
                host: addr,
                alive: false,
                ms: undefined,
                error: 'ping: socket: Operation not permitted',
                denied: true,
            });
        fallback.probeTcp = (ip, ports, timeout, cb) => setImmediate(cb, false);

        browse({}, self => {
            assert.strictEqual(self.warnings.filter(w => w.includes('setcap')).length, 1);
            done();
        });
    });

    it('scans nothing when the fallback is switched off', function (done) {
        this.timeout(10000);
        let tcp = 0;
        ping.probe = (addr, config, cb) =>
            setImmediate(cb, null, {
                host: addr,
                alive: false,
                ms: undefined,
                error: 'ping: socket: Operation not permitted',
                denied: true,
            });
        fallback.probeTcp = (ip, ports, timeout, cb) => {
            tcp++;
            setImmediate(cb, false);
        };

        browse({ pingFallbackTcp: false }, self => {
            assert.strictEqual(tcp, 0);
            assert.ok(
                self.warnings.some(w => w.includes('skipped')),
                self.warnings.join('\n'),
            );
            done();
        });
    });

    it('leaves a host where ping works alone', function (done) {
        this.timeout(10000);
        let tcp = 0;
        ping.probe = (addr, config, cb) => setImmediate(cb, null, { host: addr, alive: true, ms: 3 });
        fallback.probeTcp = (ip, ports, timeout, cb) => {
            tcp++;
            setImmediate(cb, false);
        };

        browse({}, self => {
            assert.strictEqual(tcp, 0);
            assert.strictEqual(self.warnings.length, 0);
            assert.deepStrictEqual(
                self.found.map(d => d._addr),
                ['127.0.0.1', '192.0.2.2'],
            );
            done();
        });
    });

    it('keeps pinging when the loopback is only quiet', function (done) {
        this.timeout(10000);
        let tcp = 0;
        ping.probe = (addr, config, cb) => setImmediate(cb, null, { host: addr, alive: addr !== '127.0.0.1', ms: 3 });
        fallback.probeTcp = (ip, ports, timeout, cb) => {
            tcp++;
            setImmediate(cb, false);
        };

        browse({}, self => {
            assert.strictEqual(tcp, 0);
            assert.deepStrictEqual(
                self.found.map(d => d._addr),
                ['127.0.0.1', '192.0.2.2'],
            );
            done();
        });
    });
});
