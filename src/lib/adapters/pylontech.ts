import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'pylontech';

/**
 * The console of a Pylontech battery stack.
 *
 * The adapter opens the port, sends `\r\n` on connect (`WorkerAbstract._connected()`) and
 * then reads with its own `ConsolenReader`. That reader is where the two markers below come
 * from: it cuts answers at `$$` searching backwards for the `>` prompt, and when it sees
 * `[Enter]` it answers with a carriage return - the console prints that when it wants a key
 * press. Nothing else in the exchange identifies the device, so nothing else is asked for.
 *
 * `\r\n` is all that gets written, the same as the adapter writes; no command is issued.
 */
const BAUD_RATE = 115200;
const LISTEN_TIMEOUT = 1500;

/**
 * True if this answer comes from a Pylontech console.
 *
 * @param text what came back after the carriage return
 */
export function isPylontechConsole(text: string): boolean {
    if (!text) {
        return false;
    }
    if (text.includes('[Enter]')) {
        return true;
    }
    // the reader's own condition: a `$$` terminator with a `>` prompt in front of it
    const end = text.lastIndexOf('$$');
    return end !== -1 && text.lastIndexOf('>', end) !== -1;
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
        function onOpen(port: any, done: (error?: unknown) => void): void {
            try {
                port.write('\r\n');
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
            const found = isPylontechConsole(data ? data.toString('utf8') : '');
            done(null, found, found);
        },
        function (err, found, name): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.device === name);
            if (instance) {
                options.log.info(`pylontech adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `Pylontech battery (${comName})`,
                },
                native: {
                    // "1" is the adapter's own value for the serial connection
                    connection: '1',
                    device: name,
                    baudrate: BAUD_RATE,
                },
                comment: {
                    add: [`Pylontech console on ${comName}`],
                    // US and FORCE stacks answer different commands; the console looks the same
                    text: 'Check the model - US is preset, a Force stack has to be switched over',
                },
            });

            callback(null, true, comName);
        },
    );
}

export const type = ['serial'];
export const timeout = LISTEN_TIMEOUT + 500;
