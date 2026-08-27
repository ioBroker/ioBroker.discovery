import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    name: string,
    manufacturer: string,
): boolean {
    options.log.debug(`denon FOUND! ${ip}`);
    let instance = tools.findInstance(options, 'denon', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('denon', options);
        instance = {
            _id: id,
            common: {
                name: name || manufacturer || 'DENON',
            },
            native: {
                ip: ip,
            },
            comment: {
                add: `${name || manufacturer || 'DENON'} - ${ip}`,
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

// just check if IP exists
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp._location) {
            const lines = upnp._location.split('\n');

            let manufacturer: string | undefined;
            let name: string | undefined;
            lines.forEach((line: string): void => {
                let m = line.match('<manufacturer>(.+)</manufacturer>');
                if (m) {
                    manufacturer = m[1];
                }
                m = line.match('<friendlyName>(.+)</friendlyName>');
                if (m) {
                    name = m[1];
                }

                if (
                    manufacturer &&
                    (manufacturer.toLowerCase() === 'denon' || manufacturer.toLocaleString() === 'marantz')
                ) {
                    if (addInstance(ip, device, options, name!, manufacturer)) {
                        foundInstance = true;
                    }
                }
            });
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // make type=serial for USB sticks // TODO make to upnp call location
export const timeout = 100;
