import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    native: ProtocolData,
    callback: DetectCallback,
): void {
    let instance = tools.findInstance(options, 'sonnen', obj => obj.native.ip === ip || obj.native.ip === device._name);

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('sonnen', options),
            common: {
                name: 'sonnen',
                title: `sonnen (${ip}${device._name ? ` - ${device._name}` : ''})`,
            },
            native: native,
            comment: {
                add: [ip],
            },
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
    } // endElse
} // endAddSonnen

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.httpGet(`http://${ip}:8080/api/v1/status`, (err, data): void => {
        if (err) {
            if (callback) {
                return callback(null, false, ip);
            } // endIf
        } else {
            let testData;
            try {
                testData = JSON.parse(data!);
            } catch {
                testData = null;
            }
            if (testData && Object.prototype.hasOwnProperty.call(testData, 'GridFeedIn_W')) {
                addInstance(ip, device, options, { ip }, callback);
            } else if (callback) {
                return callback(null, false, ip);
            } // endElse
        } // endElse
    });
} // endDetect

export const type = ['ip'];
export const timeout = 1500;
