import * as nodeFs from 'node:fs';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'canbus';

/**
 * A CAN adapter is not a serial port. SocketCAN - which is what the adapter's `socketcan`
 * dependency speaks - exposes it as an ordinary network interface, and the kernel writes the
 * interface family into `/sys/class/net/<name>/type`. `ARPHRD_CAN` is 280 in the kernel's
 * `include/uapi/linux/if_arp.h`, and that number is what tells `can0` apart from `eth0` (1)
 * or `wlan0` (801).
 *
 * Nothing is opened and no frame is sent: a CAN bus is shared, and writing to one is the last
 * thing a discovery scan should do.
 */
const NET_PATH = '/sys/class/net';
const ARPHRD_CAN = 280;

/**
 * List the SocketCAN interfaces of this host.
 *
 * @param path the sysfs network directory
 * @param fs injected for the test - the real call uses node:fs
 */
export function listCanInterfaces(path: string = NET_PATH, fs: typeof nodeFs = nodeFs): string[] {
    try {
        if (!fs.existsSync(path)) {
            return [];
        }
        return fs.readdirSync(path).filter(name => {
            try {
                return parseInt(fs.readFileSync(`${path}/${name}/type`, 'utf8').trim(), 10) === ARPHRD_CAN;
            } catch {
                // an interface that disappeared between listing and reading is simply not one
                return false;
            }
        });
    } catch {
        return [];
    }
}

function addInstance(name: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.interface === name);
    if (instance) {
        options.log.info(`canbus adapter already present for ${name}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `CAN bus (${name})`,
        },
        native: {
            interface: name,
        },
        comment: {
            add: [`SocketCAN interface ${name}`],
            // the adapter needs to be told which messages to read, it cannot guess them
            text: 'The bus is found, the messages on it are not - switch on "auto add seen messages" to learn them',
        },
    });

    return true;
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    // Runs once per scan against the host itself, not against a device on the network
    let found = false;

    for (const name of listCanInterfaces()) {
        options.log.debug(`SocketCAN interface found: ${name}`);
        if (addInstance(name, options)) {
            found = true;
        }
    }

    callback(null, found, ip);
}

export const type = ['once'];
// reading a handful of sysfs files takes no time worth budgeting for
export const timeout = 500;
