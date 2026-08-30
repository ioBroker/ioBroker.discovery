import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.httpGet(`http://${ip}/rest/kiwigrid/wizard/devices`, 1400, (err, data): void => {
        if (err == null && data?.includes('urn:kiwigrid:')) {
            //const managerData = JSON.parse(body);
            //if (managerData.hasOwnProperty("result")){
            let instance = tools.findInstance(options, 'energymanager', obj => obj.native.managerAddress === ip);
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('energymanager', options),
                    common: {
                        name: 'energymanager',
                        title: `energymanager (${ip}${device._name ? ` - ${device._name}` : ''})`,
                    },
                    native: {
                        managerAddress: ip,
                    },
                    comment: {
                        add: [`energymanager (${ip})`],
                    },
                };
                options.newInstances.push(instance);
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        } else {
            callback(err, false, ip);
        }
    });
}

export const type = ['ip']; // make type=serial for USB sticks
export const timeout = 1500;
