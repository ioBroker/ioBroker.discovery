import * as tools from '../tools';
import * as dgram from 'node:dgram';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

function browse(ip: string, options: DetectOptions, cb: ((...args: any[]) => void) | null): void {
    let timer: NodeJS.Timeout | null = null;
    const socket = dgram.createSocket('udp4');

    socket.on('message', msgBuffer => {
        const msg = msgBuffer.toString();
        // answer is "eQ3MaxApKMD1055338>I"
        if (msg.includes('eQ3MaxAp')) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            try {
                socket.close();
            } catch {
                // ignore
            }

            if (cb) {
                cb(null, ip);
                cb = null;
            }
        }
    });

    socket.on('error', err => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        options.log.error(`Cannot browse: ${err}`);
        try {
            socket.close();
        } catch {
            // ignore
        }

        if (cb) {
            cb(err);
            cb = null;
        }
    });
    socket.on('listening', (): void => {
        const whoIsCommand = 'eQ3Max*\0**********I';
        socket.send(whoIsCommand, 0, whoIsCommand.length, 23272, ip);
    });

    socket.bind(23275);

    timer = setTimeout((): void => {
        socket.close();
        timer = null;
        if (cb) {
            cb();
            cb = null;
        }
    }, 1000);
}

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: ((added: boolean) => void) | null,
): void {
    let instance = tools.findInstance(options, 'maxcube', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('maxcube', options);
        instance = {
            _id: id,
            common: {
                name: 'maxcube',
            },
            native: {
                ip: ip,
                bind: tools.getOwnAddress(ip),
            },
            comment: {
                add: `MAX! Cube - ${ip}`,
            },
        };
        options.newInstances.push(instance);
        return callback?.(true);
    }
    callback?.(false);
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    function cb(err: unknown, is: boolean, ip: string): void {
        if (callback) {
            callback(err, is, ip);
            callback = null;
        }
    }

    browse(ip, options, (err: unknown, ipAddr): void => {
        if (!err && ipAddr) {
            addInstance(ipAddr, device, options, (isAdded: boolean): void => cb(null, isAdded, ip));
        } else if (err) {
            options.log.warn(`MAX! Cube err: ${err as any}`);
            cb(null, false, ip);
        } else {
            cb(null, false, ip);
        }
    });
}

export const type = ['ip']; // TODO udp
// The probe itself runs up to 1000 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const MAXCUBE_PROBE_TIMEOUT = 1000;
export const timeout = MAXCUBE_PROBE_TIMEOUT + 300;
