import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'elero-usb-transmitter';

/**
 * The Elero Transmitter Stick, through the protocol of the library the adapter drives it
 * with (`elero-usb-transmitter-client`).
 *
 * Its `constants.js` gives the wire format - header `0xAA`, then the length, then the
 * command, then a checksum whose rule is stated in `calculateChecksum()`: "All the sum of all
 * bytes (Header to CS) must be 0x00". `EASY_CHECK` (0x4A) asks the stick which channels are
 * learned, so it reads and changes nothing; the answer is six bytes and validates itself
 * against the same checksum rule.
 *
 * 38400 8N1 is `DEFAULT_BAUDRATE` of the same file.
 */
const BAUD_RATE = 38400;
const BYTE_HEADER = 0xaa;
const BYTE_LENGTH_2 = 0x02;
const EASY_CHECK = 0x4a;
const EASY_CONFIRM = 0x4b;
const RESPONSE_LENGTH_CHECK = 6;

/**
 * The library's checksum: whatever makes the bytes add up to zero.
 *
 * @param bytes the message without its checksum byte
 */
export function eleroChecksum(bytes: number[]): number {
    const sum = bytes.reduce((total, byte) => total + byte, 0);
    return (256 - (sum % 256)) % 256;
}

/** The EASY_CHECK message */
export function checkRequest(): Buffer {
    const data = [BYTE_HEADER, BYTE_LENGTH_2, EASY_CHECK];
    return Buffer.from([...data, eleroChecksum(data)]);
}

/**
 * The channels a stick reports as learned, or `null` if this is not an Elero answer.
 *
 * Bytes 3 and 4 are the channel bitmaps - low channels 1..8 and high channels 9..15 - read
 * the way `getActiveChannels()` reads them.
 *
 * @param answer the bytes that came back
 */
export function parseCheckAnswer(answer: Buffer): number[] | null {
    if (!answer || answer.length < RESPONSE_LENGTH_CHECK || answer[0] !== BYTE_HEADER) {
        return null;
    }
    if (answer[2] !== EASY_CONFIRM) {
        return null;
    }
    const frame = answer.subarray(0, RESPONSE_LENGTH_CHECK);
    if (frame.reduce((total, byte) => total + byte, 0) % 256 !== 0) {
        return null;
    }

    const channels: number[] = [];
    for (const [byte, start] of [
        [frame[4], 1],
        [frame[3], 9],
    ]) {
        for (let bit = 0; bit < 9; bit++) {
            if ((byte >> bit) & 1) {
                channels.push(bit + start);
            }
        }
    }
    return channels;
}

export function detect(
    comName: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback,
): void {
    let channels: number[] | null = null;

    tools.testSerialPort(
        comName,
        { log: options.log },
        BAUD_RATE,
        function onOpen(port: any, done: (error?: unknown) => void): void {
            try {
                port.write(checkRequest());
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
            channels = data ? parseCheckAnswer(data) : null;
            const found = channels !== null;
            done(null, found, found, found ? `channels ${channels!.join(', ') || 'none'}` : undefined);
        },
        function (err, found, name): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.usbStickDevicePath === name);
            if (instance) {
                options.log.info(`elero-usb-transmitter adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            const learned = channels?.length ? `, channels ${channels.join(', ')}` : ', no channel learned';

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `Elero Transmitter Stick (${comName})`,
                },
                native: {
                    usbStickDevicePath: name,
                    // the adapter fills this itself once it has talked to the stick
                    deviceConfigs: [],
                },
                comment: {
                    add: [`Elero Transmitter Stick${learned}`, comName],
                },
            });

            callback(null, true, comName);
        },
    );
}

export const type = ['serial'];
export const timeout = 1000 + 500;
