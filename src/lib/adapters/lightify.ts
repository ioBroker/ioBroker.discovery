import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'lightify';

function detectLightify(ip: string, callback: DetectCallback): void {
    tools.testPort(
        ip,
        4000,
        1000,
        {
            onConnect: (ip, port, client): void => {
                //send getStatus for group all. Will return an error
                client.write(Buffer.from('0e00006802000000ffffffffffffffff', 'hex'));
            },
            onReceive: data => {
                try {
                    const expectedLen = data.readUInt16LE(0) + 2;
                    const fail = data.readUInt8(8);
                    return expectedLen === data.length && fail === 21; // error, getStatus not allowed für groups
                } catch {
                    return false;
                }
            },
        },
        callback,
    );
}

//const lightifyDetected = false;
//const devices = {};

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    detectLightify(ip, (err, found): void => {
        if (!found) {
            return callback(null, false, ip);
        }

        let instance = tools.findInstance(options, adapterName, obj => obj.native.ip === ip);

        if (!instance) {
            const name = device._name ? device._name : '';
            instance = {
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `Lightify (${ip}${name ? ` - ${name}` : ''})`,
                },
                native: {
                    ip: ip,
                },
                comment: {
                    add: [name, ip],
                },
            };
            options.newInstances.push(instance);
            return callback(null, true, ip);
        }
        return callback(null, false, ip);
    });

    // if (device._name.toLowerCase().indexOf('lightify') >= 0) {
    // }

    // if (device._source === undefined && ip === '127.0.0.1') {
    //     devices = {};
    //     lightifyDetected = false;
    //     // last call
    // }
}

export const type = ['mdns'];
export const timeout = 1500;
//exports.reloadModule = true;
