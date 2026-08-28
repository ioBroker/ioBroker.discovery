import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'wireless-mbus';

/**
 * The Amber wireless M-Bus stick, which is the adapter's default `deviceType`.
 *
 * Frame and checksum come from the adapter's `lib/receiver/AmberMessage.js`: a message is
 * `0xFF | command | payload length | payload | XOR over everything before it`, and a reply
 * repeats the command with bit 0x80 set. `CMD_FWV_REQ = 0x0C` is listed there as "Read
 * firmware version" - a read, nothing is written to the stick's memory.
 *
 * The adapter also drives IMST, EBI and CUL receivers. Those speak other protocols and are
 * not covered here; a CUL based receiver is already found by `adapters/cul.ts`.
 */
const BAUD_RATE = 9600;
const CMD_START = 0xff;
const CMD_FWV_REQ = 0x0c;
const CMD_CONFIRM_BIT = 0x80;

/**
 * XOR over every byte but the last, the way AmberMessage computes it.
 *
 * @param bytes the whole message, checksum byte included
 */
export function amberChecksum(bytes: Buffer): number {
    let sum = bytes[0];
    for (let i = 1; i < bytes.length - 1; i++) {
        sum ^= bytes[i];
    }
    return sum;
}

/** The "read firmware version" message */
export function firmwareRequest(): Buffer {
    const message = Buffer.from([CMD_START, CMD_FWV_REQ, 0x00, 0x00]);
    message[message.length - 1] = amberChecksum(message);
    return message;
}

/**
 * Read the reply and return the firmware version it carries.
 *
 * @param answer the bytes that came back
 */
export function parseFirmwareAnswer(answer: Buffer): string | null {
    if (!answer || answer.length < 4 || answer[0] !== CMD_START) {
        return null;
    }
    if (answer[1] !== (CMD_FWV_REQ | CMD_CONFIRM_BIT)) {
        return null;
    }

    const expected = answer[2] + 4;
    if (answer.length < expected || amberChecksum(answer.subarray(0, expected)) !== answer[expected - 1]) {
        return null;
    }

    return answer[2] >= 3 ? `${answer[3]}.${answer[4]}.${answer[5]}` : '';
}

export function detect(
    comName: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback,
): void {
    let version: string | null = null;

    tools.testSerialPort(
        comName,
        { log: options.log },
        BAUD_RATE,
        function onOpen(port: any, done: (error?: unknown) => void): void {
            try {
                port.write(firmwareRequest());
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
            version = data ? parseFirmwareAnswer(data) : null;
            const found = version !== null;
            done(null, found, found, version || undefined);
        },
        function (err, found, name): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.serialPort === name);
            if (instance) {
                options.log.info(`wireless-mbus adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `Wireless M-Bus receiver (${comName})`,
                },
                native: {
                    deviceType: 'amber',
                    serialPort: name,
                    serialBaudRate: BAUD_RATE,
                    // T is the adapter's default and the mode most meters here use
                    wmbusMode: 'T',
                },
                comment: {
                    add: [version ? `Amber wM-Bus stick, firmware ${version}` : 'Amber wM-Bus stick', comName],
                    text: 'Check the radio mode - T is preset, meters in S or C mode need it changed',
                },
            });

            callback(null, true, comName);
        },
    );
}

export const type = ['serial'];
export const timeout = 1000 + 500;
