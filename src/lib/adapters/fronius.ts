import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addDevice(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    native: ProtocolData,
    callback: DetectCallback | null,
): void {
    let instance = tools.findInstance(
        options,
        'fronius',
        obj => obj.native.ip === ip || obj.native.ip === device._name,
    );
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('fronius', options),
            common: {
                name: 'fronius',
                title: `Fronius inverters adapter (${ip}${device._name ? ` - ${device._name}` : ''})`,
            },
            native: native,
            comment: {
                add: [ip],
            },
        };
        options.newInstances.push(instance);
        callback?.(null, true, ip);
    } else {
        callback?.(null, false, ip);
    }
}

// just check if IP exists
export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }
    tools.httpGet(`http://${ip}/solar_api/GetAPIVersion.cgi`, 1400, (err, data): void => {
        if (err) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            // Get BaseURL
            let testData;
            try {
                testData = JSON.parse(data!);
            } catch {
                testData = null;
            }
            if (testData && Object.prototype.hasOwnProperty.call(testData, 'BaseURL')) {
                const baseUrl = testData.BaseURL;
                const apiVersion = testData.APIVersion;

                if (apiVersion === 1) {
                    tools.httpGet(
                        `http://${ip}${baseUrl}GetActiveDeviceInfo.cgi?DeviceClass=System`,
                        1500,
                        (err, data): void => {
                            if (err) {
                                if (callback) {
                                    callback(null, false, ip);
                                    callback = null;
                                }
                            } else {
                                let result;
                                try {
                                    result = JSON.parse(data!).Body.Data;
                                } catch {
                                    if (callback) {
                                        callback(null, false, ip);
                                        callback = null;
                                    }
                                    return;
                                }

                                const native = {
                                    ip,
                                    apiversion: 1,
                                    baseurl: baseUrl,
                                    inverter: Object.prototype.hasOwnProperty.call(result, 'Inverter')
                                        ? Object.keys(result.Inverter)
                                        : '',
                                    sensorCard: Object.prototype.hasOwnProperty.call(result, 'SensorCard')
                                        ? Object.keys(result.SensorCard)
                                        : '',
                                    stringControl: Object.prototype.hasOwnProperty.call(result, 'StringControl')
                                        ? Object.keys(result.StringControl)
                                        : '',
                                    meter: Object.prototype.hasOwnProperty.call(result, 'Meter')
                                        ? Object.keys(result.Meter)
                                        : '',
                                    storage: Object.prototype.hasOwnProperty.call(result, 'Storage')
                                        ? Object.keys(result.Storage)
                                        : '',
                                    // poll will be added automatically from io-package.json
                                };
                                addDevice(ip, device, options, native, callback);
                            }
                        },
                    );
                } else if (apiVersion === 0) {
                    tools.httpGet(
                        `http://${ip}${baseUrl}GetActiveDeviceInfo.cgi?DeviceClass=Inverter`,
                        1500,
                        (err, inverter): void => {
                            if (err) {
                                if (callback) {
                                    callback(null, false, ip);
                                    callback = null;
                                }
                            } else {
                                tools.httpGet(
                                    `http://${ip}${baseUrl}GetActiveDeviceInfo.cgi?DeviceClass=SensorCard`,
                                    (err, sensor): void => {
                                        if (err) {
                                            if (callback) {
                                                callback(null, false, ip);
                                                callback = null;
                                            }
                                        } else {
                                            tools.httpGet(
                                                `http://${ip}${
                                                    baseUrl
                                                }GetActiveDeviceInfo.cgi?DeviceClass=StringControl`,
                                                (err, strings): void => {
                                                    if (err) {
                                                        if (callback) {
                                                            callback(null, false, ip);
                                                            callback = null;
                                                        }
                                                    } else {
                                                        let inverterData!: ProtocolData;
                                                        let sensorData!: ProtocolData;
                                                        let stringsData!: ProtocolData;
                                                        try {
                                                            inverterData = JSON.parse(inverter!);
                                                            sensorData = JSON.parse(sensor!);
                                                            stringsData = JSON.parse(strings!);
                                                        } catch {
                                                            if (callback) {
                                                                callback(null, false, ip);
                                                                callback = null;
                                                            }
                                                            return;
                                                        }
                                                        const native = {
                                                            ip,
                                                            apiversion: 0,
                                                            baseurl: baseUrl,
                                                            inverter: Object.keys(inverterData.Body.Data.Inverter),
                                                            sensorCard: Object.keys(sensorData.Body.Data.SensorCard),
                                                            stringControl: Object.keys(
                                                                stringsData.Body.Data.StringControl,
                                                            ),
                                                            // poll will be added automatically from io-package.json
                                                        };

                                                        addDevice(ip, device, options, native, callback);
                                                    }
                                                },
                                            );
                                        }
                                    },
                                );
                            }
                        },
                    );
                } else if (callback) {
                    options.log.warn(`Unknown api version for "${ip}": ${apiVersion}`);
                    callback(null, false, ip);
                    callback = null;
                }
            } else if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        }
    });
}

export const type = ['ip']; // make type=serial for USB sticks
export const timeout = 1500;
