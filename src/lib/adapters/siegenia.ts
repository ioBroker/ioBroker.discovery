import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'siegenia';

/**
 * Siegenia windows, doors and ventilation.
 *
 * The adapter runs its own `discoverSiegenia()` over `mdns-js`: it browses everything and
 * keeps a device when one of its service types is called `siegenia` - which is the type
 * `_siegenia._tcp`. `methods/mdns.ts` now asks for it.
 *
 * What is deliberately *not* done here is the second step the adapter takes: it opens a
 * WebSocket to `wss://<ip>:443/WebSocket` and reads the device name out of it. That needs the
 * user's credentials, so the name is left to the adapter and only the address is proposed.
 */
const SIEGENIA_SERVICE = '_siegenia._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, SIEGENIA_SERVICE)) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device);

    // One instance covers every device; the adapter keeps them in a table
    const before = options.newInstances.length;
    let instance = tools.pendingProposal(options, adapterName);

    if (!instance) {
        instance = tools.findInstance(options, adapterName, obj =>
            (obj.native.devices || []).some((entry: ProtocolData) => entry?.ip === ip),
        );
        if (instance) {
            options.log.info(`siegenia adapter already present for ${ip}`);
            return callback(null, false, ip);
        }

        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: { name: adapterName },
            native: { devices: [] },
            comment: { add: [] },
        };
        options.newInstances.push(instance);
    }

    instance.native.devices ||= [];
    const devices = instance.native.devices as ProtocolData[];

    if (!devices.some(entry => entry?.ip === ip)) {
        // the shape of one row of the adapter's device table
        devices.push({ ip, name: name || '', user: 'user', password: '0000' });
        (instance.comment!.add as string[]).push(`Siegenia device ${name ? `${name} ` : ''}(${ip})`);
    }

    options.log.debug(`Siegenia device detected at ${ip}`);

    // the defaults above are the adapter's own fallbacks, but every device has its own PIN
    instance.comment!.inputs ||= [
        { name: 'native.devices[0].user', def: 'user', type: 'text', title: 'User name of the device' },
        { name: 'native.devices[0].password', def: '0000', type: 'password', title: 'PIN of the device' },
    ];

    callback(null, before !== options.newInstances.length, ip);
}

export const type = ['mdns'];
export const timeout = 1500;
