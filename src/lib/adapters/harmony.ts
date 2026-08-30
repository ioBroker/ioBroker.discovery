import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addHarmony(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'harmony', (): boolean => true);
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('harmony', options),
            common: {
                name: 'harmony',
            },
            native: {},
            comment: {
                add: 'harmony',
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
} // endAddHarmony

function addFakeroku(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'fakeroku', (): boolean => true);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('fakeroku', options),
            common: {
                name: 'fakeroku',
            },
            native: {},
            comment: {
                add: 'fakeroku',
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
} // endAddFakeroku

// Detects Logitech Harmony + Fakeroku
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp.USN?.includes('myharmony-com:device')) {
            options.log.debug(`Harmony Hub detected at: ${ip}`);
            const addHarmonyDev = addHarmony(ip, device, options);
            const addFakerokuDev = addFakeroku(ip, device, options);
            if (addHarmonyDev || addFakerokuDev) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
} // endDetect

export const type = ['upnp']; // make type=serial for USB sticks
export const timeout = 100;
