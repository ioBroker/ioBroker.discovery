import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'sun2000';

// Huawei publishes the inverter model as a string in holding register 30000. The adapter's
// own driver reads exactly that - `{ id: 'info.model', desc: 'reg:30000, len:15' }` in
// lib/drivers/driver_inverter.js - and logs `Identified a Huawei ${model}` from it. A model
// name starting with SUN2000 is therefore the fingerprint, and it needs no write and no
// credentials.
const MODBUS_PORT = 502;
const MODEL_REGISTER = 30000;
const MODEL_WORDS = 8;
// The second Huawei adapter defaults to unit 1; 0 is the other value inverters commonly use.
const UNIT_IDS = [1, 0];
const PROBE_TIMEOUT = 1200;
// One probe per unit id, one after the other
const DETECT_TIMEOUT = UNIT_IDS.length * PROBE_TIMEOUT + 300;

/**
 * Turn the register payload into the model name.
 *
 * Huawei pads the string with NUL bytes; anything that is not printable ASCII means we are
 * looking at something else entirely.
 *
 * @param registers the raw register bytes
 */
export function readModelName(registers: Buffer | null): string | null {
    if (!registers || !registers.length) {
        return null;
    }
    const text = registers.toString('ascii').replace(/\0+$/, '').trim();
    if (!text || !/^[\x20-\x7e]+$/.test(text)) {
        return null;
    }
    return text;
}

/** Only a Huawei inverter answers this register with a SUN2000 model name */
export function isSun2000(model: string | null): boolean {
    return !!model && /^SUN2000/i.test(model);
}

function addInstance(ip: string, model: string, unitId: number, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.address === ip);

    if (instance) {
        options.log.info(`sun2000 adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Huawei ${model} (${ip})`,
        },
        native: {
            address: ip,
            port: MODBUS_PORT,
            // the adapter takes a comma separated list of unit ids
            modbusIds: String(unitId),
        },
        comment: {
            add: [`Huawei ${model}`, ip],
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    const probe = (unitIds: number[]): void => {
        const unitId = unitIds.shift();
        if (unitId === undefined) {
            return callback(null, false, ip);
        }

        tools.readHoldingRegisters(
            ip,
            MODBUS_PORT,
            unitId,
            MODEL_REGISTER,
            MODEL_WORDS,
            PROBE_TIMEOUT,
            (err, registers): void => {
                const model = err ? null : readModelName(registers);
                if (!isSun2000(model)) {
                    // a Modbus device that is not a Huawei inverter, or no answer at all
                    return probe(unitIds);
                }

                options.log.debug(`Huawei ${model} detected at ${ip} on unit ${unitId}`);
                callback(null, addInstance(ip, model as string, unitId, options), ip);
            },
        );
    };

    probe([...UNIT_IDS]);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
