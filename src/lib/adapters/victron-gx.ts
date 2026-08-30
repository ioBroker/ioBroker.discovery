import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'victron-gx';

/**
 * A Victron GX device (Cerbo, Venus, Ekrano).
 *
 * This one is weaker than the other Modbus modules and it is worth saying why. Victron
 * publishes no model or serial register that the adapter reads - its serial numbers come over
 * MQTT - so there is nothing that names the device. What the adapter does have is a probe:
 * `readHoldingRegisters(2902, 1)` on unit 100, which it treats as "ESS unit 100 reachable".
 *
 * That alone proves reachability, not identity: a Modbus gateway that ignores the unit id
 * answers it just as well. So a second read is the control - the same register on unit 1. A
 * real GX has no ESS settings there and refuses; a device that answers both is passing
 * everything through and is not accepted.
 *
 * Unit 100 for the system and 238 for VE.Bus are the ids the adapter names itself
 * (`this.modbusClient.setID(100)` and the comment "Inverter (vebus, Unit 238)").
 */
const MODBUS_PORT = 502;
/** ESS settings, the register the adapter probes unit 100 with */
const ESS_REGISTER = 2902;
const SYSTEM_UNIT = 100;
/** where any other Modbus device would answer - here it has to stay silent */
const CONTROL_UNIT = 1;
const PROBE_TIMEOUT = 1200;
// main.ts arms its watchdog with the value below *before* it calls detect(), so it has to be
// larger than the two reads together
const DETECT_TIMEOUT = 2 * PROBE_TIMEOUT + 300;

function addInstance(ip: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);

    if (instance) {
        options.log.info(`victron-gx adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Victron GX (${ip})`,
        },
        native: {
            host: ip,
            modbusPort: MODBUS_PORT,
        },
        comment: {
            add: [`Victron GX, ESS on unit ${SYSTEM_UNIT} (${ip})`],
            // The adapter reads its data over MQTT and uses Modbus only for writing, which is
            // off by default - and the broker has to be switched on on the GX itself.
            text: 'Found over Modbus; the adapter reads over MQTT - switch the broker on in the GX settings',
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    tools.readHoldingRegisters(ip, MODBUS_PORT, SYSTEM_UNIT, ESS_REGISTER, 1, PROBE_TIMEOUT, (err, registers): void => {
        if (err || !registers) {
            return callback(null, false, ip);
        }

        // control: the same register where a GX keeps nothing
        tools.readHoldingRegisters(
            ip,
            MODBUS_PORT,
            CONTROL_UNIT,
            ESS_REGISTER,
            1,
            PROBE_TIMEOUT,
            (controlErr, controlRegisters): void => {
                if (!controlErr && controlRegisters) {
                    options.log.debug(
                        `${ip} answers register ${ESS_REGISTER} on every unit - a gateway, not a Victron GX`,
                    );
                    return callback(null, false, ip);
                }

                options.log.debug(`Victron GX detected at ${ip}`);
                callback(null, addInstance(ip, options), ip);
            },
        );
    });
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
