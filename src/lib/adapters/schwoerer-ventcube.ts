import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'schwoerer-ventcube';

/**
 * The Schwörer VentCube ventilation unit.
 *
 * Also weaker than the rest, and for a plain reason: the adapter's parameter list has no model
 * and no serial number, only small enumerations from register 100 upwards. So instead of one
 * telling register, fourteen are read and each is held against the range its own
 * `parameters.js` declares for it.
 *
 * The one that carries the most weight is 103, "manual linear air throughput", declared as
 * `{ min: 1, max: 100 }`: a device that answers unknown registers with zeros - the usual way
 * a range check gets fooled - falls out on that one.
 */
const MODBUS_PORT = 502;
const UNIT_ID = 1;
const PROBE_TIMEOUT = 1200;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the two reads together
const DETECT_TIMEOUT = 2 * PROBE_TIMEOUT + 300;

/** First block: operation mode, fan levels, air throughput, override */
const FIRST_BLOCK = { start: 100, count: 5 };
/** Second block: time plan, shock ventilation, heat pump and fan states */
const SECOND_BLOCK = { start: 110, count: 9 };

/**
 * The ranges `lib/schwoerer/parameters.js` declares, keyed by register address. Registers 113
 * and 115 are not in that list and are therefore not checked.
 */
const RANGES: Record<number, [number, number]> = {
    100: [0, 4], // Betriebsart
    101: [0, 6], // manuelle Luftstufe
    102: [0, 4], // aktuelle Luftstufe
    103: [1, 100], // manuelle lineare Luftleistung - the one that rejects an all-zero answer
    104: [0, 1], // Luftstufen-Überschreibung
    110: [0, 4], // Luftstufe des Zeitplans
    111: [0, 1], // Stosslüftung
    112: [0, 60], // Restlaufzeit Stosslüftung
    114: [0, 49], // Status Wärmepumpe
    116: [0, 1], // NHR-Zustand
    117: [0, 6], // Status Gebläse Zuluft
    118: [0, 6], // Status Gebläse Abluft
};

/**
 * True if every register of this block sits inside its declared range.
 *
 * @param registers the raw payload of the answer
 * @param start address of the first register in the block
 */
export function blockInRange(registers: Buffer | null, start: number): boolean {
    if (!registers || registers.length < 2) {
        return false;
    }
    const words = registers.length / 2;

    for (let i = 0; i < words; i++) {
        const range = RANGES[start + i];
        if (!range) {
            continue; // not declared, so nothing to hold it against
        }
        const value = registers.readUInt16BE(i * 2);
        if (value < range[0] || value > range[1]) {
            return false;
        }
    }
    return true;
}

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.server === ip);

    if (instance) {
        options.log.info(`schwoerer-ventcube adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Schwörer VentCube (${ip})`,
        },
        native: {
            server: ip,
            port: MODBUS_PORT,
        },
        comment: {
            add: [`Schwörer VentCube ventilation (${ip})`],
            // said plainly, because it is: no model register, only plausible values
            text: 'Recognised by the value ranges of its registers, not by a model - please confirm',
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.readHoldingRegisters(
        ip,
        MODBUS_PORT,
        UNIT_ID,
        FIRST_BLOCK.start,
        FIRST_BLOCK.count,
        PROBE_TIMEOUT,
        (err, registers): void => {
            if (err || !blockInRange(registers, FIRST_BLOCK.start)) {
                return callback(null, false, ip);
            }

            tools.readHoldingRegisters(
                ip,
                MODBUS_PORT,
                UNIT_ID,
                SECOND_BLOCK.start,
                SECOND_BLOCK.count,
                PROBE_TIMEOUT,
                (secondErr, secondRegisters): void => {
                    if (secondErr || !blockInRange(secondRegisters, SECOND_BLOCK.start)) {
                        return callback(null, false, ip);
                    }

                    options.log.debug(`Schwörer VentCube detected at ${ip}`);
                    callback(null, addInstance(ip, options), ip);
                },
            );
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
