import type { DetectCallback, MethodInstance, ProtocolData } from '../types';
import type * as pingModule from './ping/ping';
import type * as fallbackModule from './ping/fallback';

// Lazily required so that a host without them can still run the other methods.
// They are assigned in browse() before anything below touches them.
let dns: any;
let ping: typeof pingModule;
let fallback: typeof fallbackModule;
let os: any;
let Netmask: any;
let ownIPs: string[] = [];

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function pingAll(self: MethodInstance): void {
    self.addDevice({
        _addr: '127.0.0.1',
        _name: 'localhost',
        _ping: {
            alive: true,
            ms: 2000,
        },
    });

    dns ||= require('node:dns');
    ping ||= require('./ping/ping');
    fallback ||= require('./ping/fallback');
    os ||= require('node:os');
    Netmask ||= require('netmask').Netmask;

    self.options.pingTimeout = Math.round(self.options.pingTimeout / 1000) || 1;
    self.options.pingBlock = parseInt(self.options.pingBlock as unknown as string, 10) || 20;
    self.pingBlock = self.options.pingBlock;

    let ranges!: ProtocolData[];
    let blockCount;
    let ipCount;
    let rangeCount = 0;

    // Set when this host turned out to be unable to send ICMP - see checkPing()
    let denied = false;
    let useFallback = false;
    const fallbackPorts = fallback.parsePorts(self.options.pingFallbackPorts);
    // The probes are fired 50 ms apart and answer whenever they answer; this counts the ones
    // still on the wire so that the method does not report itself done before they are back.
    let pending = 0;

    const pingConfig = (): ProtocolData => ({ log: self.adapter.log.debug, timeout: self.options.pingTimeout });

    function getRanges(): void {
        const interfaces = os.networkInterfaces();
        ranges = [];
        ownIPs = [];
        self.adapter.log.debug(`Network interfaces found: ${JSON.stringify(interfaces)}`);
        if (
            typeof self.options.pingOwnIP === 'string' &&
            /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
                self.options.pingOwnIP,
            )
        ) {
            // add the configured network segment
            self.adapter.log.info(
                `Add pingOwnIP network entry: ${self.options.pingOwnIP} / ${self.options.pingOwnNetmask}`,
            );
            interfaces['ioBroker.discovery'] = [
                {
                    family: 'IPv4',
                    netmask: self.options.pingOwnNetmask
                        ? self.options.pingOwnNetmask.toString()
                        : self.options.pingOwnNetmask,
                    address: self.options.pingOwnIP,
                    internal: false,
                },
            ];
        } else if (self.options.pingOwnIP) {
            self.adapter.log.info(`Ignore pingOwnIP setting because invalid: ${self.options.pingOwnIP}`);
        }
        for (const k in interfaces) {
            if (!Object.prototype.hasOwnProperty.call(interfaces, k) || interfaces[k].internal) {
                continue;
            }
            for (const k2 in interfaces[k]) {
                if (!Object.prototype.hasOwnProperty.call(interfaces[k], k2)) {
                    continue;
                }

                const address = interfaces[k][k2];

                if (address.family === 'IPv4' && !address.internal) {
                    const parts = (address.netmask || '').split('.');
                    // If range is too big => reduce it to 255.255.255.0

                    // TODO: try to ping x.x.x.1 and if someone is there, take this range too
                    // TODO: add ranges, where UPnP found devices

                    if (
                        parts.length === 4 &&
                        (parseInt(parts[0], 10) !== 255 ||
                            parseInt(parts[1], 10) !== 255 ||
                            parseInt(parts[2], 10) < 0xfc) /* 255.255.252.0 */
                    ) {
                        parts[0] = '255';
                        parts[1] = '255';
                        parts[2] = '255';
                        address.netmask = parts.join('.');
                    }
                    ownIPs.push(address.address);
                    ranges.push({ ip: address.address, mask: address.netmask });
                }
            }
        }
        self.adapter.log.debug(`ownIPs: ${JSON.stringify(ownIPs)}`);
        self.adapter.log.debug(`ranges: ${JSON.stringify(ranges)}`);
    }

    /** Remember that ping is unusable here and say so once - see lib/methods/ping/fallback.ts */
    function noteDenied(stderr?: string): void {
        if (denied) {
            return;
        }
        denied = true;
        useFallback = self.options.pingFallbackTcp !== false;
        fallback
            .deniedHint(stderr, useFallback ? fallbackPorts : undefined)
            .forEach(line => self.adapter.log.warn(line));
    }

    /**
     * Ask the loopback whether ping may be used at all.
     *
     * 127.0.0.1 always answers, so a failure here is the binary and not the network: an
     * unprivileged LXC container may not open the ICMP socket in the first place (issue #247)
     * and would otherwise report the whole range as offline without a word in the log.
     * Anything else than a permission problem is left alone - a host that simply does not
     * answer on the loopback keeps its ping scan.
     */
    function checkPing(callback: () => void): void {
        ping.probe('127.0.0.1', pingConfig(), (err: unknown, res?: pingModule.PingResult): void => {
            if (err) {
                // the binary is missing or could not be started at all
                noteDenied((err as Error)?.message || String(err as any));
            } else if (res && !res.alive && res.denied) {
                noteDenied(res.error);
            } else if (res && !res.alive) {
                self.adapter.log.debug(`The loopback does not answer a ping: ${res.error || 'no output'}`);
            }
            callback();
        });
    }

    function reportAlive(host: string, ms: number | undefined, how?: string): void {
        self.adapter.log.debug(`found ${host}${how ? ` (${how})` : ''}`);

        self.addDevice({
            _addr: host,
            _ping: {
                alive: true,
                ms,
            },
        });
    }

    function pingBlock(ips: string[], _callback: ((...args: any[]) => void) | null): void {
        function callback(err: unknown): void {
            _callback?.(err);
            _callback = null;
        }
        ipCount = 0;

        (function pingIp(error?: unknown): void {
            if (error || ipCount >= ips.length) {
                return callback(error);
            }
            const ip = ips[ipCount++];
            // is this necessary? own IPs are filtered out in pingRanges
            if (ownIPs.includes(ip)) {
                return pingIp(error);
            }
            // IP already known;
            if (self.get(ip, 'ip') !== undefined) {
                return pingIp(error);
            }

            pending++;
            if (useFallback) {
                // ICMP is not available here - a TCP connect tells us just as well whether
                // somebody lives at this address
                fallback.probeTcp(
                    ip,
                    fallbackPorts,
                    self.options.pingTimeout * 1000,
                    (alive: boolean, port?: number): void => {
                        pending--;
                        if (self.halt === true || self.halt.ping) {
                            return pingIp('halt');
                        }
                        if (alive) {
                            reportAlive(ip, undefined, `tcp/${port}`);
                        }
                    },
                );
            } else {
                ping.probe(ip, pingConfig(), (err: unknown, res?: pingModule.PingResult): void => {
                    pending--;
                    if (self.halt === true || self.halt.ping) {
                        return pingIp('halt');
                    }

                    err && self.adapter.log.error(String(err as any));

                    // A single address may be blocked by a local firewall rule while the
                    // loopback test passed - switch the rest of the scan over as well
                    if (res?.denied) {
                        noteDenied(res.error);
                    }

                    if (!res?.alive) {
                        return;
                    }
                    reportAlive(res.host, res.ms);

                    // dns.reverse(res.host, function (err, hostnames) {  will be done in main. Only for unknown names. Maybe ohter methods find a name before
                    //     const obj;
                    //     if (hostnames && hostnames.length) {
                    //         obj = {
                    //             _name: hostnames[0],
                    //             _ping: {
                    //                 hostnames: hostnames
                    //             }
                    //             // i don't know if it is used
                    //             // , _data: {
                    //             //     names: hostnames
                    //             // }
                    //         }
                    //     } else {
                    //         obj = { _name: res.host };
                    //     }
                    //     obj._addr = res.host;
                    //
                    //     self.addDevice (obj);
                    // });
                });
            }
            setTimeout(pingIp, 50, error);
        })();
    }

    function pingRange(range: ProtocolData, callback: DetectCallback): void {
        const blocks: string[][] = [[]];
        let b = 0;
        try {
            const block = new Netmask(`${range.ip}/${range.mask}`); //subnet);
            block.forEach((ip: string): void => {
                // skip own ip
                if (ip === range.ip) {
                    return;
                }
                if (blocks[b].length >= self.pingBlock) {
                    blocks[++b] = [];
                }
                blocks[b].push(ip);
            });
        } catch (err) {
            self.adapter.log.warn(String(err));
            return callback(err);
        }

        if (blocks.length > 100) {
            const err = 'Unable to ping all addresses: To big addresses range.';
            self.adapter.log.warn(String(err));
            return callback(err);
        }

        blockCount = 0;
        (function pingBlocks(err): void {
            if (err || blockCount >= blocks.length) {
                return callback(err);
            }
            const rangeProgress = ((rangeCount - 1) * 100) / ranges.length;
            const currentRangeBlockProgress = blockCount / blocks.length;
            const currentProgress = rangeProgress + (100 / ranges.length) * currentRangeBlockProgress;
            self.updateProgress(currentProgress);
            pingBlock(blocks[blockCount++], pingBlocks);
        })();
    }

    /** Let the probes that are still on the wire answer before the method reports itself done */
    function finish(err?: unknown): void {
        const deadline = Date.now() + self.options.pingTimeout * 1000 + 500;
        (function wait(): void {
            if (!pending || Date.now() > deadline || self.halt === true || self.halt.ping) {
                return self.done(err);
            }
            setTimeout(wait, 100);
        })();
    }

    self.adapter.log.info('Discovering ping devices...');
    getRanges();

    checkPing((): void => {
        if (denied && !useFallback) {
            // nothing to do: every address would answer "not alive"
            return self.done();
        }

        (function pingRanges(err?: unknown): void {
            if (err || rangeCount >= ranges.length) {
                return finish(err);
            }
            pingRange(ranges[rangeCount++], pingRanges);
        })();
    });
}

export const browse = pingAll;
export const type = 'ip';
export const source = 'ping';

export const options = {
    pingTimeout: {
        // not needed, or?
        min: 1000,
        type: 'number',
    },
    pingBlock: {
        min: 1,
        max: 50,
        type: 'number',
    },
};
