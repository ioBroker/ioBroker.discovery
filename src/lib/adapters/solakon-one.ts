import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'solakon-one';

/**
 * The Solakon ONE hybrid inverter.
 *
 * Its `lib/registers.js` names three identification registers - `model_name` at 30000,
 * `serial_number` at 30016 and `mfg_id` at 30032, sixteen registers of string each - and says
 * where they come from: converted out of the Home Assistant integration's `const.py`.
 *
 * Register 30000 is the same address Huawei uses, and `adapters/sun2000.ts` reads it too:
 * this is the Huawei register layout under another name. The two are told apart by what the
 * device calls itself - a Huawei answers `SUN2000-...`, and only a name that does not is
 * offered to this adapter. Should a rebranded unit really answer `SUN2000`, the Huawei
 * proposal is the right one anyway.
 */
const MODBUS_PORT = 502;
const MODEL_REGISTER = 30000;
const MODEL_LENGTH = 16;
const MANUFACTURER_REGISTER = 30032;
const MANUFACTURER_LENGTH = 16;
/** the adapter's own default */
const UNIT_ID = 1;
const PROBE_TIMEOUT = 1500;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the two reads together
const DETECT_TIMEOUT = 2 * PROBE_TIMEOUT + 300;

/**
 * True if this pair of strings belongs to a Solakon and not to the Huawei that shares the
 * register map.
 *
 * @param model what register 30000 delivered
 * @param manufacturer what register 30032 delivered
 */
export function isSolakon(model: string | null, manufacturer: string | null): boolean {
    if (!model) {
        return false;
    }
    if (/^SUN2000/i.test(model)) {
        // a Huawei; adapters/sun2000.ts takes that one
        return false;
    }
    return /solakon/i.test(model) || /solakon/i.test(manufacturer || '');
}

function addInstance(ip: string, model: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`solakon-one adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `${model} (${ip})`,
        },
        native: {
            host: ip,
            port: MODBUS_PORT,
            slaveId: UNIT_ID,
        },
        comment: {
            add: [`Solakon ${model} (${ip})`],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.readHoldingRegisters(
        ip,
        MODBUS_PORT,
        UNIT_ID,
        MODEL_REGISTER,
        MODEL_LENGTH,
        PROBE_TIMEOUT,
        (err, registers): void => {
            const model = err ? null : tools.registerString(registers);
            if (!model || /^SUN2000/i.test(model)) {
                return callback(null, false, ip);
            }

            // the model alone rarely says Solakon, so the manufacturer register decides
            tools.readHoldingRegisters(
                ip,
                MODBUS_PORT,
                UNIT_ID,
                MANUFACTURER_REGISTER,
                MANUFACTURER_LENGTH,
                PROBE_TIMEOUT,
                (_e, mfgRegisters): void => {
                    const manufacturer = tools.registerString(mfgRegisters);
                    if (!isSolakon(model, manufacturer)) {
                        return callback(null, false, ip);
                    }

                    options.log.debug(`Solakon ONE detected at ${ip}: ${model}`);
                    callback(null, addInstance(ip, model, options), ip);
                },
            );
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
