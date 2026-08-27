import * as tools from '../tools';
import * as dgram from 'node:dgram';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';
const adapterName = 'kecontact';
const DEFAULT_UDP_PORT = 7090;
//const BROADCAST_UDP_PORT = 7092;
const DETECT_MESSAGE = Buffer.from('i');
const KEBA_TIMEOUT = 500;
let socket: dgram.Socket | null = null;
let timer: NodeJS.Timeout | null = null;

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`Keba KeContact adapter already present for IP ${ip}`);
    } else {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: `Keba KeContact P30 (${ip})`,
            },
            native: {
                host: ip,
            },
            comment: {
                add: ['control your Keba KeContact P30 charging station'],
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    options.log.debug(`Detecting Keba KeContact wallbox on ${ip}...`);

    timer = setTimeout((): void => {
        options.log.debug('Keba timeout reached');
        timer = null;
        cleanup(ip, callback, false);
        callback = null;
    }, KEBA_TIMEOUT);

    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', err => {
        options.log.error(`Keba rxSocket error:${err.stack}`);
        cleanup(ip, callback, false);
        callback = null;
    });

    socket.on('listening', (): void => {
        const address = socket!.address();
        options.log.debug(`Keba UDP server listening on ${address.address}:${address.port}`);
        socket!.setBroadcast(true);
        socket!.send(
            DETECT_MESSAGE,
            0,
            DETECT_MESSAGE.length,
            DEFAULT_UDP_PORT,
            ip,
            (err: unknown): unknown => err && options.log.warn(`Error from KeContact: ${String(err as any)}`),
        );
    });

    socket.on('message', (message, remote): void => {
        options.log.debug(`UDP datagram from ${remote.address}:${remote.port}: "${String(message)}"`);
        if (message.equals(DETECT_MESSAGE)) {
            options.log.debug('broadcast message received by myself ...');
            return;
        }

        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (message.length > 0) {
            // no defined response needed regarding Keba docs
            cleanup(ip, callback, addInstance(remote.address, device, options));
            callback = null;
        } else {
            cleanup(ip, callback, false);
            callback = null;
        }
    });

    socket.bind(DEFAULT_UDP_PORT);
}

function cleanup(ip: string, callback: DetectCallback | null, callbackResult: boolean): void {
    if (socket) {
        socket.close((): void | undefined => callback?.(null, callbackResult, ip));

        socket = null;
    } else {
        callback?.(null, callbackResult, ip);
    }
}

export const type = ['ip']; // normally detection should wok with UDP, but charging station isn't responding on broadcast messages, only on concrete IP
export const timeout = KEBA_TIMEOUT;
