import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function listen(ip: string, options: DetectOptions, cb: ((...args: any[]) => void) | null): void {
    tools.udpScan(ip, 4321, '0.0.0.0', 9898, '{"cmd": "whois"}', 500, (err, msg): void => {
        options.log.debug(msg!);
        const parsed: ProtocolData = JSON.parse(msg!);

        if (parsed && parsed.model && parsed.model === 'gateway') {
            options.log.debug(`mihome1: ${ip}`);
            options.log.debug(`mihome1: ${JSON.stringify(parsed)}`);

            if (cb) {
                cb(null, ip);
                cb = null;
            }
        }
    });
}

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: ((added: boolean) => void) | null,
): void {
    options.log.debug('mihome1: found one');
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
                err && options.log.warn(`Mihome err: ${err as any}`);
                cb(null, false, ip);
            }
        });
    } else {
        cb(null, false, ip);
    }
}

export const type = ['ip']; // TODO check if udp
// The probe itself runs up to 500 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const MIHOME_PROBE_TIMEOUT = 500;
export const timeout = MIHOME_PROBE_TIMEOUT + 300;
