import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'cul';

// The `cul` npm library the adapter drives the stick with writes a bare `V` as its keepalive
// (`this.write('V')`), and the firmware answers with its version banner - `V 1.67 nanoCUL868`
// or similar. That banner naming the board is what identifies a CUL.
//
// 9600 is the adapter's own default, 38400 is what the newer nanoCUL boards ship with.
const BAUD_RATES = [9600, 38400];
const CUL_BANNER = /^\s*V\s*[\d.]+\s*\S*CUL/i;

/** Does this answer look like the version banner of a CUL board? */
export function isCulBanner(answer: string): boolean {
    return CUL_BANNER.test(answer);
}

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
            const found = isCulBanner(text);
            done(null, found, found, found ? text.trim() : undefined);
        },
        function (err, found, name, baudRate, version): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.serialport === name);
            if (instance) {
                options.log.info(`cul adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `CUL (${comName})`,
                },
                native: {
                    serialport: name,
                    // whichever rate the board actually answered at
                    baudrate: typeof baudRate === 'number' ? baudRate : BAUD_RATES[0],
                    type: 'cul',
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
// testSerialPort tries the rates one after the other, so the watchdog needs room for both
export const timeout = 2 * 1000 + 500;
