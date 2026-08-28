import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'smartmeter';

/**
 * An SML meter pushes its telegram through the infrared head every couple of seconds - the
 * adapter's own default transport is called `SerialResponseTransport` for exactly that
 * reason. So nothing is written here at all: the port is opened and listened to.
 *
 * The start of a telegram is the escape sequence `1b 1b 1b 1b 01 01 01 01`, which is what
 * `smartmeter-obis` looks for in `SmlProtocol.js`
 * (`/((1b1b1b1b01010101((?!1b1b1b1b.{8}).)*1b1b1b1b.{8}))/`). 9600 baud is the default of the
 * same library.
 */
const BAUD_RATE = 9600;
const SML_START = Buffer.from([0x1b, 0x1b, 0x1b, 0x1b, 0x01, 0x01, 0x01, 0x01]);
/** telegrams come about once a second, so this is one repeat plus room */
const LISTEN_TIMEOUT = 2500;

/**
 * True if these bytes contain the start of an SML telegram.
 *
 * @param data what came in on the port
 */
export function hasSmlTelegram(data: Buffer): boolean {
    return !!data && data.includes(SML_START);
}

export function detect(
    comName: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback,
): void {
    tools.testSerialPort(
        comName,
        { log: options.log, timeout: LISTEN_TIMEOUT },
        BAUD_RATE,
        // nothing is sent - a reading head only listens, and so does this
        null,
        function onAnswer(
            port: any,
            data: Buffer,
            done: (error: unknown, found?: boolean, isStop?: boolean, someInfo?: string) => void,
        ): void {
            const found = hasSmlTelegram(data);
            done(null, found, found);
        },
        function (err, found, name): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.transportSerialPort === name);
            if (instance) {
                options.log.info(`smartmeter adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `Smart meter reading head (${comName})`,
                },
                native: {
                    protocol: 'SmlProtocol',
                    transport: 'SerialResponseTransport',
                    transportSerialPort: name,
                    transportSerialBaudrate: BAUD_RATE,
                },
                comment: {
                    add: [`SML telegrams on ${comName}`],
                    // D0 meters need 300 baud, a wake-up sequence and 7E1 - not covered here
                    text: 'Recognised by its SML telegrams; a D0 meter has to be set up by hand',
                },
            });

            callback(null, true, comName);
        },
    );
}

export const type = ['serial'];
// the module only listens, so the watchdog has to outlast the listening window
export const timeout = LISTEN_TIMEOUT + 500;
