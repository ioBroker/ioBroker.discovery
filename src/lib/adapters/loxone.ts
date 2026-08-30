'use strict';

import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';
const portRegex = /<presentationURL>https?:\/\/[^:]+:(\d+)[^\d<]*<\/presentationURL>/;

function addLoxone(ip: string, port: number, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'loxone', obj => obj?.native?.host === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('loxone', options),
            common: {
                name: 'loxone',
            },
            native: {
                host: ip,
                port: port,
            },
            comment: {
                add: [tools.translate(options.language, 'for %s', ip)],
                inputs: [
                    {
                        name: 'native.username',
                        def: '',
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'user', // see translation in words.js
                    },
                    {
                        name: 'native.password',
                        def: '',
                        type: 'password', // text, checkbox, number, select, password. Select requires
                        title: 'password', // see translation in words.js
                    },
                ],
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp._location?.includes('loxone')) {
            const portArr = upnp._location.match(portRegex) || ['', '80'];
            if (addLoxone(ip, portArr[1], device, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // TODO check if upnp and location call
export const timeout = 500;
