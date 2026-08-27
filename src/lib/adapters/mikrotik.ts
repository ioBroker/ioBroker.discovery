import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance, ProtocolData } from '../types';
const mndp = require('node-mndp').NodeMndp;

function addInstance(device: DiscoveryDevice, options: DetectOptions, cb: (...args: any[]) => void): void {
    let instance = tools.findInstance(options, 'mikrotik', obj => obj.native.host === device.ipAddress);
    if (!instance) {
        const id = tools.getNextInstanceID('mikrotik', options);
        instance = {
            _id: id,
            common: {
                name: 'mikrotik',
                enabled: false,
                title: (obj: DiscoveryInstance): any => obj.common.title,
            },
            comment: {
                add: [`${device.identity} ${device.version}`, device.ipAddress],
            },
        } as DiscoveryInstance;
        options.newInstances.push(instance);
        instance.native = {
            host: device.ipAddress,
            port: 8728,
            login: 'admin',
            password: '',
            timeout: 10,
            ch2: true,
            ch3: true,
            ch4: true,
            ch5: true,
            ch6: true,
            ch7: true,
            ch8: true,
        };
        cb?.(true);
    } else {
        cb?.(false);
    }
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

    const discovery = new mndp({ port: 5678 });
    discovery.on('deviceFound', (dev: ProtocolData): void => {
        discovery.stop();
        if (dev) {
            addInstance(dev, options, (state: boolean): void => {
                cb?.(null, state, ip);
            });
        }
    });
    discovery.on('error', (e: unknown): void => {
        discovery.stop();
        cb?.(e, false, ip);
    });
    discovery.start();
}

export const type = ['udp'];
export const timeout = 10000;
