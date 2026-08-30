import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'sigenergy';

/**
 * Sigenergy hybrid inverters and storage.
 *
 * The adapter's `lib/registers.js` puts `inverter.modelType` at holding register 30500, 15
 * registers of STRING, and the serial number right behind it at 30515. Its own
 * `SigenMicroScanner` uses exactly that pair to walk the slave ids and says what to expect:
 * "A SigenMicro responds with a model string beginning with 'SigenMicro'". Everything in the
 * family answers with a Sigen name, which is what is tested for here.
 *
 * Not to be confused with Huawei: `adapters/sun2000.ts` reads register 30000, and a Sigenergy
 * keeps `plant.systemTime` there - no overlap in either direction.
 */
const MODBUS_PORT = 502;
const MODEL_REGISTER = 30500;
const MODEL_LENGTH = 15;
const SERIAL_REGISTER = 30515;
const SERIAL_LENGTH = 10;
/** the adapter's default inverter id; the plant sits on 247 and has no model string */
const UNIT_ID = 1;
const PROBE_TIMEOUT = 1500;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the two reads together
const DETECT_TIMEOUT = 2 * PROBE_TIMEOUT + 300;

/**
 * True if this model string names a Sigenergy device.
 *
 * @param model what register 30500 delivered
 */
export function isSigenergy(model: string | null): boolean {
    return !!model && /^Sigen/i.test(model);
}

function addInstance(ip: string, model: string, serial: string | null, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.tcpHost === ip);

    if (instance) {
        options.log.info(`sigenergy adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `${model} (${ip})`,
        },
        native: {
            connectionType: 'tcp',
            tcpHost: ip,
            tcpPort: MODBUS_PORT,
            inverterId: UNIT_ID,
        },
        comment: {
            add: [`Sigenergy ${model}${serial ? `, s/n ${serial}` : ''} (${ip})`],
            // the plant id differs per installation and cannot be read off the inverter
            text: 'Check the plant ID - 247 is preset',
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
            const model = tools.registerString(registers);
            if (err || !isSigenergy(model)) {
                return callback(null, false, ip);
            }

            options.log.debug(`Sigenergy detected at ${ip}: ${model}`);

            // the serial only decorates the proposal, so a failure here changes nothing
            tools.readHoldingRegisters(
                ip,
                MODBUS_PORT,
                UNIT_ID,
                SERIAL_REGISTER,
                SERIAL_LENGTH,
                PROBE_TIMEOUT,
                (_e, serialRegisters): void =>
                    callback(null, addInstance(ip, model!, tools.registerString(serialRegisters), options), ip),
            );
        },
    );
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
