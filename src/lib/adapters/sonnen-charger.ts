import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'sonnen-charger';

/**
 * The sonnen wallbox.
 *
 * Its `ChargerController.js` reads one block and takes everything it needs to name the device
 * out of it: `readInputRegisters(990, 31)`, then serial number from words 0..9, model from
 * 10..19, hardware version from 20..24, software version from 25..29 and the number of
 * connectors from word 30.
 *
 * Note the function code - these are *input* registers (4), not holding registers (3), which
 * is why `tools.readInputRegisters()` exists.
 */
const MODBUS_PORT = 502;
const INFO_REGISTER = 990;
const INFO_LENGTH = 31;
/** the wallbox answers on the default unit */
const UNIT_ID = 1;
const PROBE_TIMEOUT = 1500;
// main.ts arms its watchdog with this before it calls detect(), so leave the read room
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;

export interface ChargerInfo {
    serial: string;
    model: string;
    connectors: number;
}

/**
 * Split the info block the way the adapter splits it.
 *
 * A block that names neither a serial nor a model, or that claims an impossible number of
 * connectors, is some other device answering register 990.
 *
 * @param registers the 62 bytes of the answer
 */
export function parseChargerInfo(registers: Buffer | null): ChargerInfo | null {
    if (!registers || registers.length < INFO_LENGTH * 2) {
        return null;
    }

    const serial = tools.registerString(registers.subarray(0, 20));
    const model = tools.registerString(registers.subarray(20, 40));
    const connectors = registers.readInt16BE(60);

    if (!serial || !model || connectors < 1 || connectors > 8) {
        return null;
    }
    // the strings have to read like text, not like a measurement that happens to sit there
    if (!/^[\x20-\x7e]+$/.test(serial) || !/^[\x20-\x7e]+$/.test(model)) {
        return null;
    }

    return { serial, model, connectors };
}

function addInstance(ip: string, info: ChargerInfo, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.serverIp === ip);

    if (instance) {
        options.log.info(`sonnen-charger adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `sonnen charger ${info.model} (${ip})`,
        },
        native: {
            serverIp: ip,
            serverPort: MODBUS_PORT,
        },
        comment: {
            add: [
                `sonnen charger ${info.model}, s/n ${info.serial}, ` +
                    `${info.connectors} connector${info.connectors === 1 ? '' : 's'} (${ip})`,
            ],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.readInputRegisters(
        ip,
        MODBUS_PORT,
        UNIT_ID,
        INFO_REGISTER,
        INFO_LENGTH,
        PROBE_TIMEOUT,
        (err, registers): void => {
            const info = err ? null : parseChargerInfo(registers);
            if (!info) {
                return callback(null, false, ip);
            }

            options.log.debug(`sonnen charger detected at ${ip}: ${info.model}`);
            callback(null, addInstance(ip, info, options), ip);
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
