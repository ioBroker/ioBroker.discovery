import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

export function detect(
    comName: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback,
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
    const baudRates = [57600];
    tools.testSerialPort(
        comName,
        { log: options.log },
        baudRates,
        function onOpen(port: any, callback: (error?: unknown) => void): void {
            try {
                options.log.warn('write: ' + '10;VERSION;');
                port.write('10;VERSION;');
                port.drain();
            } catch (e) {
                options.log.warn(`Cannot write to port: ${e}`);
                return callback(e);
            }
            callback();
        },
        function onAnswer(
            port: any,
            data: Buffer,
            callback: (error: unknown, found?: boolean, isStop?: boolean, someInfo?: string) => void,
        ): void {
            options.log.warn(`Received: ${String(data)}`);
            // expected 20;99;"RFLink Gateway software version";
            // const text = data ? data.toString() : '';
            callback(null, data.includes('RadioFrequencyLink'), true); // todo return here version of FW
        },
        function (err, found, name, baudRate, version): void {
            if (found) {
                let instance = tools.findInstance(options, 'rflink', obj => obj.native.comName === name);

                if (!instance) {
                    instance = {
                        _id: tools.getNextInstanceID('rflink', options),
                        common: {
                            name: 'rflink',
                            title: `RFLink (${comName}${
                                device._name && device._name !== comName ? ` - ${device._name}` : ''
                            })`,
                        },
                        native: {
                            comName: name,
                            baudRate: baudRate,
                        },
                        comment: {
                            add: [
                                `RFLink USB ${
                                    version
                                        ? `${version} ${tools.translate(options.language, 'on %s', comName)}`
                                        : ` - ${comName}`
                                }`,
                            ],
                        },
                    };
                    options.newInstances.push(instance);
                    callback(null, true, comName);
                } else {
                    callback(null, false, comName);
                }
            } else {
                callback(null, false, comName);
            }
        },
    );
}

export const type = ['serial']; // make type=serial for USB sticks
