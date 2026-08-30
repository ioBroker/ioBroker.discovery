import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const adapterName = 'firetv';

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    meta: ProtocolData,
    callback: DetectCallback,
): void {
    const newInstanceCount = options.newInstances.length;
    let instance = tools.findInstance(options, adapterName);
    const add = [device._name, ip];

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
            },
            native: {
                //useSSDP: true,
                devices: [],
            },
            comment: {
                add: [], //add
            },
        };
        options.newInstances.push(instance);
    }
    let nDevices;
    let dev =
        instance?.native &&
        (nDevices = instance.native.devices) &&
        nDevices.find((dev: ProtocolData): boolean => dev.ip === ip);
    if (!dev) {
        dev = {
            ip: ip,
            name: device._name,
        };

        nDevices.push(dev);

        if (instance._existing) {
            options.newInstances.push(instance);
            instance.comment ||= {};
        }

        if (instance.comment!.ack) {
            instance.comment!.ack = false;
        }

        if (instance.comment!.add) {
            instance.comment!.add.push(add.join(', '));
        } else {
            instance.comment!.extended = instance.comment!.extended || [];
            instance.comment!.extended.push(add.join(', '));
        }
    }
    callback(null, newInstanceCount !== options.newInstances.length, ip);
}

const reamzn = /^amzn\.dmgr:/;
const isamzn = reamzn.test.bind(reamzn);

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // console.log('firetv.detect: ' + device._source + ' ip=' + ip + ' ' + device._name + ' _mdns: ' + !!device._mdns);
    let ptr;
    let srv;
    let found;

    if (!device._mdns) {
        return callback(null, false, ip);
    }

    found = (ptr = device._mdns.PTR) && (isamzn(ptr.data) || isamzn(ptr.name));
    found ||= (srv = device._mdns.SRV) && isamzn(srv.name);
    if (!found) {
        return callback(null, false, ip);
    }

    addInstance(ip, device, options, device._mdns, callback);
}

export const type = ['mdns'];
export const timeout = 100;
