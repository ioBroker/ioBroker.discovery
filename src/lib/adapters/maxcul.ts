import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'maxcul';

// Same hardware as the cul adapter, different firmware mode: maxcul drives a CUL board that
// speaks the MAX! protocol. The board is identified the same way - a bare `V` answered with
// the version banner - so both adapters are offered for the same stick and the user picks.
//
// 38400 is the adapter's own default and what the MAX! firmware ships with.
const BAUD_RATES = [38400, 9600];
const CUL_BANNER = /^\s*V\s*[\d.]+\s*\S*CUL/i;

export function detect(
    comName: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback,
): void {
    tools.testSerialPort(
        comName,
        { log: options.log },
        [...BAUD_RATES],
        function onOpen(port: any, done: (error?: unknown) => void): void {
            try {
                port.write('V\r\n');
                port.drain();
            } catch (e) {
                options.log.debug(`Cannot write to port ${comName}: ${e}`);
                return done(e);
            }
            done();
        },
        function onAnswer(
            port: any,
            data: Buffer,
            done: (error: unknown, found?: boolean, isStop?: boolean, someInfo?: string) => void,
        ): void {
            const text = data ? data.toString() : '';
            const found = CUL_BANNER.test(text);
            done(null, found, found, found ? text.trim() : undefined);
        },
        function (err, found, name, baudRate, version): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.serialport === name);
            if (instance) {
                options.log.info(`maxcul adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `MAX! Cube via CUL (${comName})`,
                },
                native: {
                    connectionType: 'serial',
                    serialport: name,
                    baudrate: typeof baudRate === 'number' ? baudRate : BAUD_RATES[0],
                },
                comment: {
                    add: [version ? `CUL ${version}` : 'CUL', comName],
                },
            });

            callback(null, true, comName);
        },
    );
}

export const type = ['serial'];
export const timeout = 2 * 1000 + 500;
