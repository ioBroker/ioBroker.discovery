import * as nodeFs from 'node:fs';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'ds18b20';

// 1-Wire sensors are not serial ports - the kernel exposes them as directories. The adapter's
// own default for `w1DevicesPath` is this path, and every DS18B20 shows up there as a folder
// named `28-<serial>`; the family code 28 is what makes it a DS18B20 rather than some other
// 1-Wire chip.
const W1_PATH = '/sys/bus/w1/devices';
const SENSOR_DIR = /^28-[0-9a-f]+$/i;

/**
 * List the DS18B20 sensors the kernel exposes.
 *
 * @param path the 1-Wire device directory
 * @param fs injected for the test - the real call uses node:fs
 */
export function listSensors(path: string = W1_PATH, fs: typeof nodeFs = nodeFs): string[] {
    try {
        if (!fs.existsSync(path)) {
            return [];
        }
        return fs.readdirSync(path).filter(name => SENSOR_DIR.test(String(name)));
    } catch {
        // an unreadable directory is the same as none for our purposes
        return [];
    }
}

function addInstance(sensors: string[], options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName);
    if (instance) {
        options.log.info('ds18b20 adapter already present');
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `1-Wire temperature sensors (${sensors.length})`,
        },
        native: {
            w1DevicesPath: W1_PATH,
            // the adapter reads the addresses itself; listing them here would only go stale
            sensors: [],
        },
        comment: {
            add: sensors.map(sensor => `DS18B20 ${sensor}`),
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // Runs once per scan against the host itself, not against a device on the network
    const sensors = listSensors();
    if (!sensors.length) {
        return callback(null, false, ip);
    }

    options.log.debug(`Found ${sensors.length} DS18B20 sensor(s) in ${W1_PATH}`);
    callback(null, addInstance(sensors, options), ip);
}

export const type = ['once'];
export const timeout = 1000;
