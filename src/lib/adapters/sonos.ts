import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, DiscoveryInstance, ProtocolData } from '../types';

function insertDevice(
    options: DetectOptions,
    instance: DiscoveryInstance,
    fromOldInstances: boolean,
    ip: string,
    name?: string,
    room?: string,
): void {
    // find unique name
    let i: any = ''; // starts empty, becomes the numeric suffix from the second device on
    let found;

    name ||= '';
    do {
        found = false;
        for (let d = 0; d < instance.native.devices.length; d++) {
            if (instance.native.devices[d].name === name + (i ? `-${i}` : '')) {
                found = true;
                break;
            }
        }
        if (!found) {
            break;
        }
        if (!i) {
            i = 1;
        } else {
            i++;
        }
    } while (found);

    name = name + (i ? `-${i}` : '');

    const device = {
        ip: ip,
        name: name,
        room: tools.checkEnumName(options.enums!['enum.rooms'], room || ''),
    };

    instance.native.devices.push(device);

    if (fromOldInstances) {
        options.newInstances.push(instance);
        instance.comment ||= {};
    }
    if (!instance.comment!.add) {
        instance.comment!.extended = instance.comment!.extended || [];
        instance.comment!.extended.push(`${device.ip} - ${device.name}`);
    } else {
        instance.comment!.add.push(`${device.ip} - ${device.name}`);
    }
}

function addSonos(ip: string, data: ProtocolData, options: DetectOptions): false | undefined {
    let instance;
    let fromOldInstances = false;
    for (let j = 0; j < options.newInstances.length; j++) {
        if (options.newInstances[j].common?.name === 'sonos') {
            instance = options.newInstances[j];
            break;
        }
    }
    if (!instance) {
        for (let i = 0; i < options.existingInstances.length; i++) {
            if (options.existingInstances[i].common?.name === 'sonos') {
                instance = JSON.parse(JSON.stringify(options.existingInstances[i])); // do not modify existing instance
                fromOldInstances = true;
                break;
            }
        }
    }

    // sonos required web instance so check and install it too
    //let webInstance = tools.findInstance(options, 'web', obj => obj && obj.native && !obj.native.secure);

    /*if (!webInstance) {
        webInstance = {
            _id: tools.getNextInstanceID('web', options),
            common: {
                name: 'web',
                title: 'ioBroker web Adapter with no security'
            },
            native: {
            },
            comment: {
                add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))]
            }
        };
        options.newInstances.push(webInstance);
    }*/
    if (!instance) {
        const id = tools.getNextInstanceID('sonos', options);
        instance = {
            _id: id,
            common: {
                name: 'sonos',
            },
            native: {
                devices: [],
            },
            comment: {
                add: [],
                required: [/*webInstance._id*/],
            },
        };
        options.newInstances.push(instance);
    }

    const isNew = false;
    let found = false;
    for (let d = 0; d < instance.native.devices.length; d++) {
        if (instance.native.devices[d].ip === ip) {
            found = true;
            break;
        }
    }

    if (!found) {
        if (data?._location) {
            const mRoom = data._location.match(/<roomName>(.+)<\/roomName>/);
            const mName = data._location.match(/<displayName>(.+)<\/displayName>/);
            let name;
            let room;
            if (mRoom?.[1]) {
                room = mRoom[1];
            }
            if (mName?.[1]) {
                name = mName[1].replace(/[.:]/g, '_');
            }
            insertDevice(options, instance, fromOldInstances, ip, name, room);
        } else {
            insertDevice(options, instance, fromOldInstances, ip);
            return isNew;
        }
    } else {
        return isNew;
    }
}

// just check if IP exists
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && JSON.stringify(upnp).includes('Sonos')) {
            options.log.debug(`SONOS UPnP device: ${JSON.stringify(upnp)}`);
            if (addSonos(ip, upnp, options)) {
                foundInstance = true;
            }
        }
    });
    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // make type=serial for USB sticks
export const timeout = 1500;
