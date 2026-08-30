import * as cp from 'node:child_process';
import { existsSync } from 'node:fs';
import type { ProtocolData } from '../../types';
const p = require('node:os').platform().toLowerCase();

let isWin = false;
let init: any;
const xfamily = ['linux', 'sunos', 'unix'];
//const regex = /=.*[<|=]([0-9]*).*TTL|ttl..*=([0-9\.]*)/;
const regex = /=.*[<|=]([0-9]*).*?ttl.*?=([0-9.]*)/im;

/**
 * Everything a ping writes to stderr when it may not open its socket at all.
 *
 * An unprivileged LXC container is the usual reason (issue #247): its `/bin/ping` has neither
 * `cap_net_raw` nor a `net.ipv4.ping_group_range` that covers the ioBroker user, so every
 * single address of the range answers "not alive" and the scan finds nothing but localhost.
 * `sendmsg: Operation not permitted` is a local firewall dropping ICMP instead - the
 * consequence is the same, ping cannot be used on this host.
 */
const deniedPatterns = [
    /operation not permitted/i,
    /permission denied/i,
    /are you root/i,
    /root privilege/i,
    /must be root/i,
    /cap_net_raw/i,
    /lacking privilege/i,
];

/** True when the ping process failed because it may not send ICMP, not because the host is away */
export function isPermissionError(text: string | undefined | null): boolean {
    if (!text) {
        return false;
    }
    return deniedPatterns.some(pattern => pattern.test(text));
}

/**
 * The ping binary of this host.
 *
 * Not every system keeps it in `/bin`: macOS and FreeBSD have `/sbin/ping`, and a container
 * built without the usr-merge may only carry `/usr/bin/ping`. The bare `ping` as the last
 * resort lets PATH decide instead of failing with ENOENT.
 */
function findPingBinary(): string {
    for (const candidate of ['/bin/ping', '/usr/bin/ping', '/sbin/ping', '/usr/sbin/ping']) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return 'ping';
}

export const reset = function (): void {
    // if config changed
    init = null;
};

export interface PingResult {
    host: string;
    alive: boolean;
    ms: number | undefined;
    /** What the ping process wrote to stderr when it wrote anything */
    error?: string;
    /** The process was not allowed to send ICMP - see {@link isPermissionError} */
    denied?: boolean;
}

export type PingCallback = (error: unknown, result?: PingResult) => void;

export function probe(addr: string, config: ProtocolData, callback: PingCallback | null): void {
    config ||= {};

    let ls = null;
    // const log = config.log || console.log;
    let outString = '';
    let errString = '';

    if (!init) {
        init = function (ip: string): any {
            let args: string[] = [];
            config = {
                numeric: config.numeric === undefined ? true : config.numeric,
                timeout: parseInt(config.timeout === undefined ? 2 : config.timeout, 10),
                minReply: parseInt(config.minReply === undefined ? 1 : config.minReply, 10),
                extra: config.extra || [],
            };

            // const args    = [];
            if (xfamily.includes(p)) {
                //linux
                //args = [];
                if (config.numeric !== false) {
                    args.push('-n');
                }

                if (config.timeout !== false) {
                    args.push(`-w ${config.timeout}`);
                }

                if (config.minReply !== false) {
                    args.push(`-c ${config.minReply}`);
                }

                if (config.extra !== false) {
                    args = args.concat(config.extra);
                }

                args.push(ip);
                const binary = findPingBinary();
                //log('System command: ' + binary + ' ' + args.join(' '));
                init = function (ip: string): cp.ChildProcessWithoutNullStreams {
                    args[args.length - 1] = ip;
                    return cp.spawn(binary, args);
                };
            } else if (p.match(/^win/)) {
                //windows
                isWin = true;
                let _args = [];
                if (config.minReply !== false) {
                    _args.push(`-n ${config.minReply}`);
                }

                if (config.timeout !== false) {
                    _args.push(`-w ${config.timeout * 1000}`);
                }

                if (config.extra !== false) {
                    _args = _args.concat(config.extra);
                }

                _args.push(ip);

                args = [
                    '/s', // leave quotes as they are
                    '/c', // run and exit
                    // !!! the order of c and s is important - c must come last!!!
                    '"', // enforce starting quote
                    `${process.env.SystemRoot}\\system32\\ping.exe`, // command itself. Notice that you'll have to pass it quoted if it contains spaces
                ]
                    .concat(_args)
                    .concat('"'); // enforce closing quote

                // log('System command: ' + (process.env.comspec || 'cmd.exe') + ' ' + allArgs.join(' '));
                // switch the command to cmd shell instead of the original command
                init = function (ip: string): cp.ChildProcessWithoutNullStreams {
                    args[args.length - 2] = ip;
                    return cp.spawn(process.env.comspec || 'cmd.exe', args, { windowsVerbatimArguments: true });
                };
            } else if (p === 'darwin' || p === 'freebsd') {
                // Mac OS X or freebsd
                // args = [];
                if (config.numeric !== false) {
                    args.push('-n');
                }

                if (config.timeout !== false) {
                    args.push(`-t ${config.timeout}`);
                }

                if (config.minReply !== false) {
                    args.push(`-c ${config.minReply}`);
                }

                if (config.extra !== false) {
                    args = args.concat(config.extra);
                }

                args.push(ip);
                const binary = findPingBinary();
                // log('System command: ' + binary + ' ' + args.join(' '));
                init = function (_ip: string): cp.ChildProcessWithoutNullStreams {
                    args[args.length - 1] = _ip;
                    return cp.spawn(binary, args);
                };
            } else {
                return callback?.(`Your platform "${p}" is not supported`);
            }
            return init(ip);
        };
    }

    ls = init(addr);

    ls.on('error', (e: Error): void => {
        callback?.(
            new Error(
                `ping.probe: there was an error while executing the ping program. check the path or permissions... (${e?.message})`,
            ),
        );
        callback = null;
    });

    ls.stdout.on('data', (data: ProtocolData): string => (outString += String(data)));
    // Without this a host that may not open an ICMP socket looks exactly like an empty
    // network: every address answers "not alive" and nothing says why.
    ls.stderr.on('data', (data: ProtocolData): string => (errString += String(data)));

    ls.on('exit', (code: number | null): void => {
        let ms;
        let m; //, result = 1;
        if ((m = regex.exec(outString)) && m.length >= 2) {
            ms = ~~m[1];
            // result = 0;
        }

        // const lines  = outString.split('\n');
        // for (const t = 0; t < lines.length; t++) {
        //     const m = regex.exec(lines[t]) || '';
        //     if (m !== '') {
        //         ms = m[1];
        //         result = 0;
        //         break;
        //     }
        // }

        if (callback) {
            const error = errString.trim();
            callback(null, {
                host: addr,
                alive: isWin ? ms !== undefined : !code,
                ms,
                error: error || undefined,
                denied: isPermissionError(error),
            });
            callback = null;
        }
    });
}
