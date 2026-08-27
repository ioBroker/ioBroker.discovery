import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function listen(ip: string, options: DetectOptions, cb: (...args: any[]) => void): void {
    tools.udpScan('224.0.0.50', 4321, '0.0.0.0', 9898, '{"cmd": "whois"}', 500, (err, msg): void => {
        options.log.debug(msg!);
        try {
            const parsed: ProtocolData = JSON.parse(msg!);
            if (parsed && parsed.model && parsed.model === 'gateway') {
                options.log.debug(`mihome: ${ip}`);
                options.log.debug(`mihome: ${JSON.stringify(parsed)}`);
                cb?.(null, ip);
            } else {
                cb?.("msg.model !== 'gateway'");
            }
        } catch (e) {
            cb?.(`error${e}`);
        }
    });
}

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: ((added: boolean) => void) | null,
): void {
    options.log.debug('mihome: found one');
    let instance = tools.findInstance(options, 'mihome');

    if (!instance) {
        const id = tools.getNextInstanceID('mihome', options);
        instance = {
            _id: id,
            common: {
                name: 'mihome',
            },
            native: {
                bind: tools.getOwnAddress(ip),
            },
            comment: {
                add: `Xiaomi Mi Home - ${ip}`,
                inputs: [
                    {
                        name: 'native.key',
                        def: '',
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'Key', // see translation in words.js
                    },
                    {
                        def: 'https://github.com/ioBroker/ioBroker.mihome#requirements',
                        type: 'link',
                        title: tools.translate(options.language, 'See description of key here '), // see translation in words.js
                    },
                ],
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

    if (device._type === 'ip') {
        listen(ip, options, (err: unknown, ipAddr): void => {
            if (!err && ipAddr) {
                options.log.debug('mihome: found one');
                addInstance(ipAddr, device, options, (isAdded: boolean): void => cb(null, isAdded, ip));
            } else {
                err && options.log.warn(`Mihome err: ${String(err as any)}`);
                cb(null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

export const type = ['udp']; // TODO check if udp
export const timeout = 500;
