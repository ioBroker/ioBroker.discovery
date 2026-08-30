/**
 * What the ping method does on a host that is not allowed to send ICMP.
 *
 * Issue #247: in an unprivileged LXC container `/bin/ping` has neither `cap_net_raw` nor a
 * `net.ipv4.ping_group_range` that covers the ioBroker user. Every address of the range then
 * answers "not alive", the scan reports localhost and nothing else, and the log says nothing
 * about why. TCP sockets are not affected by that restriction, so the range can still be
 * swept - only with a connect instead of an echo request.
 *
 * The pure decisions are here and not in `methods/ping.ts` so that `test/ping-fallback.test.js`
 * can reach them without a network.
 */
import * as net from 'node:net';

/**
 * Ports a device on a home network answers on most often.
 *
 * A connect is only half of the evidence: a host that refuses the connection (RST) proves it
 * is there just as well as one that accepts it, so a closed port is not a wasted probe.
 */
export const DEFAULT_TCP_PORTS = [80, 443, 22, 8080, 8443, 1883];

/** Result of a single connect attempt */
export type Reachability = 'alive' | 'unknown';

/**
 * What a failed connect says about the host.
 *
 * `ECONNREFUSED` and `ECONNRESET` are answers - something at that address processed the SYN.
 * A timeout, `EHOSTUNREACH` (nobody answered the ARP request) or `ENETUNREACH` say nothing
 * more than "no answer", and `EACCES`/`EPERM` is the local firewall blocking us.
 */
export function classifyConnectError(code: string | undefined): Reachability {
    return code === 'ECONNREFUSED' || code === 'ECONNRESET' ? 'alive' : 'unknown';
}

/** Read the configured port list; anything unusable falls back to {@link DEFAULT_TCP_PORTS} */
export function parsePorts(value: unknown, fallback: number[] = DEFAULT_TCP_PORTS): number[] {
    if (Array.isArray(value)) {
        value = value.join(',');
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
        return [...fallback];
    }
    const ports: number[] = [];
    for (const part of String(value).split(/[,;\s]+/)) {
        const port = parseInt(part, 10);
        if (port > 0 && port < 65536 && !ports.includes(port)) {
            ports.push(port);
        }
    }
    return ports.length ? ports : [...fallback];
}

/**
 * The lines the log shows once when ping turned out to be unusable.
 *
 * They name the two commands that repair it, because neither of them can be run from here:
 * both need root on the *host*, and an adapter that calls `sudo` would fail on every properly
 * set up system anyway.
 */
export function deniedHint(stderr?: string, ports?: number[]): string[] {
    const lines = [
        `This host may not send ICMP packets, a ping scan cannot find anything here${stderr ? `: ${stderr.split('\n')[0]}` : ''}`,
        'That is the normal state of an unprivileged LXC container. To repair it, run as root in this container: ' +
            'setcap cap_net_raw+ep $(which ping) - or allow unprivileged ICMP for everyone with ' +
            'sysctl -w net.ipv4.ping_group_range="0 2147483647", which usually has to be done on the container host. ' +
            'A system update can reset both again.',
    ];
    lines.push(
        ports?.length
            ? `Falling back to a TCP scan of the ports ${ports.join(', ')} - only devices that answer on one of them are found.`
            : 'The TCP fallback is switched off in the settings, so the ping scan is skipped.',
    );
    return lines;
}

export type TcpProbeCallback = (alive: boolean, port?: number) => void;

/**
 * Ask an address over TCP whether anybody is there.
 *
 * Every port is tried at the same time and the first answer of any kind - an open port or a
 * refusal - ends the probe.
 */
export function probeTcp(ip: string, ports: number[], timeout: number, callback: TcpProbeCallback): void {
    if (!ports.length) {
        setImmediate(callback, false);
        return;
    }

    const sockets: net.Socket[] = [];
    let pending = ports.length;
    let answered = false;

    const finish = (alive: boolean, port?: number): void => {
        if (answered) {
            return;
        }
        answered = true;
        sockets.forEach(socket => socket.destroy());
        callback(alive, port);
    };

    const settle = (): void => {
        if (!--pending && !answered) {
            finish(false);
        }
    };

    for (const port of ports) {
        const socket = new net.Socket();
        let done = false;
        // A socket may report both a timeout and an error - count it once
        const once = (fn: () => void): void => {
            if (!done) {
                done = true;
                fn();
            }
        };

        sockets.push(socket);
        socket.setTimeout(timeout);
        socket.on('connect', (): void => once((): void => finish(true, port)));
        socket.on('timeout', (): void =>
            once((): void => {
                socket.destroy();
                settle();
            }),
        );
        socket.on('error', (error: NodeJS.ErrnoException): void =>
            once((): void => {
                if (classifyConnectError(error?.code) === 'alive') {
                    finish(true, port);
                } else {
                    settle();
                }
            }),
        );
        socket.connect(port, ip);
    }
}
