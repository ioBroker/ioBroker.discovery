import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'sun2000-modbus';

// Same hardware and the same identification register as the `sun2000` module - both adapters
// read the same Huawei inverter, so both are offered and the user picks. See sun2000.ts for
// where the register comes from.
const MODBUS_PORT = 502;
const MODEL_REGISTER = 30000;
const MODEL_WORDS = 8;
// This adapter's own default is unit 1
const UNIT_IDS = [1, 0];
const PROBE_TIMEOUT = 1200;
const DETECT_TIMEOUT = UNIT_IDS.length * PROBE_TIMEOUT + 300;

const MODEL = /^SUN2000/i;

function modelName(registers: Buffer | null): string | null {
    if (!registers?.length) {
        return null;
    }
    const text = registers.toString('ascii').replace(/\0+$/, '').trim();
    return text && /^[\x20-\x7e]+$/.test(text) && MODEL.test(text) ? text : null;
}

function addInstance(ip: string, model: string, unitId: number, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.address === ip);

    if (instance) {
        options.log.info(`sun2000-modbus adapter already present for ${ip}`);
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
            // this adapter takes a single unit id, not a list
            modbusUnitId: unitId,
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
                const model = err ? null : modelName(registers);
                if (!model) {
                    return probe(unitIds);
                }

                options.log.debug(`Huawei ${model} detected at ${ip} on unit ${unitId}`);
                callback(null, addInstance(ip, model, unitId, options), ip);
            },
        );
    };

    probe([...UNIT_IDS]);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
