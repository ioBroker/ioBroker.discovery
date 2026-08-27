import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const reName = /^<\?xml.*Unit_Name="(.*?)".*YamahaRemoteControl/;

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (device._source !== 'ip') {
        return callback(null, false, ip);
    }

    tools.httpGet(`http://${ip}/YamahaRemoteControl/desc.xml`, (err, data): void => {
        let ar;
        if (!err && data && (ar = reName.exec(data)) && ar.length >= 2) {
            let instance = tools.findInstance(options, 'yamaha', obj => obj.native.ip === ip);
            if (!instance) {
                let name: string | undefined = ar[1];
                name = name || device._name ? device._name : '';
                instance = {
                    _id: tools.getNextInstanceID('yamaha', options),
                    common: {
                        name: 'yamaha',
                        title: `Yamaha (${ip}${name ? ` - ${name}` : ''})`,
                    },
                    native: {
                        ip: ip,
                        intervall: 120,
                        useRealtime: true,
                        refreshOnRealtime: true,
                    },
                    comment: {
                        add: [ar[1], name, ip],
                    },
                };
                options.newInstances.push(instance);
                return callback(null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

export const type = ['ip'];
