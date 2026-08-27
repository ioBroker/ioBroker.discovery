import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

const port80 = ':80';
const port3000 = ':3000';

const debug = false;

function addResolInstance(ip: string, device: DiscoveryDevice, devInfo: ProtocolData, options: DetectOptions): boolean {
    let foundNew = false;
    debug && options.log.debug(`Parsed Device Information of ${ip} ${JSON.stringify(devInfo)}`);
    let instance = tools.findInstance(options, 'resol', obj => obj.native.connectionIdentifier === ip);

    if (!instance) {
        foundNew = true;
        const devName = device._name ? (devInfo.name ? devInfo.name : device._name) : '';
        const devVendor = devInfo.vendor;
        device._name = devName;
        let devType = 'lan';
        if (devInfo.product === 'DL2' || devInfo.product === 'KM2') {
            devType = 'dl2';
        } else if (devInfo.product === 'DL3') {
            devType = 'dl3';
        }
        debug && options.log.debug(`New Device ${devVendor} ${devName} Type ${devType} found!`);

        instance = {
            _id: tools.getNextInstanceID('resol', options),
            common: {
                name: 'resol',
                title: `RESOL Device (${ip}${devName ? ` - ${devName}` : ''})`,
            },
            native: {
                connectionIdentifier: ip,
                connectionDevice: devType,
                vbusPassword: 'vbus',
            },
            comment: {
                add: [`${devVendor} ${devName} (${ip})`],
            },
        };
        options.newInstances.push(instance);
    }
    return foundNew;
}

function parseDeviceInformation(string: string): Record<string, any> {
    const result: Record<string, any> = {};

    const re = /(\w+)\s*=\s*"([^"\r\n]*)"/g;

    let md = re.exec(string);
    while (md) {
        const [key, value] = md;
        result[key] = value;
        md = re.exec(string);
    }

    return result;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (device._source !== 'RESOL VBus') {
        return callback(null, false, ip);
    }

    debug && options.log.debug(`Start detecting VBus device information on ${ip}...`);

    const devInfoURL = `http://${ip}${port80}/cgi-bin/get_resol_device_information`;
    debug && options.log.debug(`Checking for device information at ${ip}${port80}`);

    tools.httpGet(devInfoURL, 2000, (err, data): void => {
        if (err) {
            // try port 3000
            const devInfoURL = `http://${ip}${port3000}/cgi-bin/get_resol_device_information`;

            debug && options.log.debug(`Checking for device information at ${ip}${port3000}`);

            void tools
                .httpGet(devInfoURL, 2000)
                .catch(err => {
                    debug && options.log.debug(`No VBus device information found! ${err.message} `);
                    callback(null, false, ip);
                })
                .then(data => {
                    options.log.debug(`VBus Device Information found at ${ip}${port3000}\n${String(data)}`);
                    const devData = parseDeviceInformation(data!);
                    if (addResolInstance(ip, device, devData, options)) {
                        debug && options.log.debug(`Pushed new VBus device instance on ${ip}${port3000}`);
                        callback(null, true, ip);
                    } else {
                        callback(null, false, ip);
                    }
                });
        } else {
            options.log.debug(`VBus Device Information found at ${ip}${port80}\n${data}`);
            const devData = parseDeviceInformation(data!);
            if (addResolInstance(ip, device, devData, options)) {
                debug && options.log.debug(`Pushed new VBus device instance on ${ip}${port80}`);
                callback(null, true, ip);
            } else {
                callback(null, false, ip);
            }
        }
    });
}

export const type = ['vbus'];
