import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'enocean';

/**
 * ESP3, the serial protocol of an EnOcean gateway. Everything below is taken from the
 * adapter's own `sendData()` and `getGatewayInfo()`:
 *
 *   sync 0x55 | data length (2) | optional length | packet type | CRC8 over those four bytes
 *   | data | CRC8 over the data
 *
 * `getGatewayInfo()` asks for CO_RD_VERSION - data `[0x03]` with packet type 5 - and reads
 * the answer as a 33 byte RESPONSE, taking the chip id out of bytes 15..19 and the
 * application description out of 23..39. The same question is asked here.
 *
 * A gateway sends nothing by itself, so passive listening would find nothing; this is a
 * read-only command that changes no setting on the stick.
 */
const BAUD_RATE = 57600;
const SYNC = 0x55;
const PACKET_TYPE_COMMON_COMMAND = 5;
const PACKET_TYPE_RESPONSE = 2;
const CO_RD_VERSION = 0x03;

/** The CRC8 table of the adapter's `lib/tools/CRC8.js` (polynomial 0x07) */
const CRC8_TABLE = ((): number[] => {
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
        let crc = n;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
        }
        table[n] = crc;
    }
    return table;
})();

export function crc8(data: Buffer | number[]): number {
    let crc = 0;
    for (const byte of data) {
        crc = CRC8_TABLE[crc ^ byte];
    }
    return crc;
}

/** The CO_RD_VERSION telegram, built exactly the way the adapter builds it */
export function versionRequest(): Buffer {
    const header = Buffer.from([0x00, 0x01, 0x00, PACKET_TYPE_COMMON_COMMAND]);
    const data = Buffer.from([CO_RD_VERSION]);
    return Buffer.concat([Buffer.from([SYNC]), header, Buffer.from([crc8(header)]), data, Buffer.from([crc8(data)])]);
}

export interface GatewayInfo {
    chipId?: string;
    description?: string;
}

/**
 * Read the answer. Accepted only if it is a RESPONSE packet whose header checksum is right -
 * that is what tells an EnOcean gateway apart from any other device that happens to send a
 * 0x55 byte.
 *
 * @param answer the bytes that came back
 */
export function parseVersionResponse(answer: Buffer): GatewayInfo | null {
    if (answer.length < 7 || answer[0] !== SYNC || answer[4] !== PACKET_TYPE_RESPONSE) {
        return null;
    }
    if (crc8(answer.subarray(1, 5)) !== answer[5]) {
        return null;
    }

    // the fields the adapter reads out of the same answer
    return {
        chipId: answer.length >= 19 ? answer.subarray(15, 19).toString('hex') : undefined,
        description:
            answer.length >= 39 ? answer.subarray(23, 39).toString('utf8').replace(/\0/g, '').trim() : undefined,
    };
}

export function detect(
    comName: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback,
): void {
    let info: GatewayInfo | null = null;

    tools.testSerialPort(
        comName,
        { log: options.log },
        BAUD_RATE,
        function onOpen(port: any, done: (error?: unknown) => void): void {
            try {
                port.write(versionRequest());
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
            info = data ? parseVersionResponse(data) : null;
            const found = !!info;
            done(null, found, found, found ? info!.description || info!.chipId : undefined);
        },
        function (err, found, name): void {
            if (!found) {
                return callback(null, false, comName);
            }

            const instance = tools.findInstance(options, adapterName, obj => obj.native.serialport === name);
            if (instance) {
                options.log.info(`enocean adapter already present for ${name}`);
                return callback(null, false, comName);
            }

            const label = [info?.description, info?.chipId && `chip ${info.chipId}`].filter(Boolean).join(', ');

            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: {
                    name: adapterName,
                    title: `EnOcean gateway (${comName})`,
                },
                native: {
                    serialport: name,
                    ser2net: false,
                },
                comment: {
                    add: [label ? `EnOcean gateway ${label}` : 'EnOcean gateway', comName],
                },
            });

            callback(null, true, comName);
        },
    );
}

export const type = ['serial'];
// one rate, and testSerialPort waits a second for the answer
export const timeout = 1000 + 500;
