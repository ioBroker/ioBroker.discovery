import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(data: ProtocolData, options: DetectOptions, callback: DetectCallback): void {
    let ip = data.Address;
    if (ip.includes('//')) {
        ip = ip.substr(ip.lastIndexOf('/') + 1);
    }

    let instance = tools.findInstance(options, 'emby', obj => obj.native.ip === ip);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('emby', options),
            common: {
                name: 'emby',
                title: `Emby (${data.Name})`,
            },
            native: {
                ip: ip,
                apiKey: '',
                deviceIds: '',
                timeout: 1500,
            },
            comment: {
                add: `${data.Name} (${ip})`,
            },
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    }
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.udpScan(ip, 7359, '0.0.0.0', 1234, 'who is EmbyServer?', 1400, (err, data): void => {
        if (!err && data) {
            try {
                const parsed: ProtocolData = JSON.parse(data);
                if (parsed.Address) {
                    addInstance(parsed, options, callback);
                }
            } catch (e) {
                options.log.error(`emby error ${e}`);
                callback(null, false, ip);
            }
        } else {
            err && options.log.error(`emby error ${err as any}`);
            callback(null, false, ip);
        }
    });
} // endDetect

export const type = ['ip']; // TODO make to once and upd lookup
// The probe itself runs up to 1400 ms. main.js arms its watchdog with the value below *before* it
// calls detect(), so it has to be the larger of the two - otherwise the watchdog wins the race and
// a late answer is thrown away.
const EMBY_PROBE_TIMEOUT = 1400;
export const timeout = EMBY_PROBE_TIMEOUT + 300;
