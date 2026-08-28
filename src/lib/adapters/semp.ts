import * as dgram from 'node:dgram';
import { randomUUID } from 'node:crypto';
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'semp';

/**
 * The adapter is the SEMP *server*: it announces itself as
 * `urn:schemas-simple-energy-management-protocol:device:Gateway:1` (see its `SSDPServer.js`)
 * and waits for an SMA Sunny Home Manager to register the appliances. Detecting that
 * announcement would only ever find our own instance, so the counterpart is what is looked
 * for here - the Home Manager itself.
 *
 * It gives itself away on the SMA energy meter multicast: `adapters/sma-em.ts` reads the
 * SUSy-ID out of the very same datagram and maps 372 and 501 to "Sunny Home Manager 2.0".
 * That is the same wire format and the same identification, only the conclusion differs.
 */
const MULTICAST_PORT = 9522;
const MULTICAST_IP = '239.12.255.254';
/** longest interval between two energy meter multicasts is 1000 ms */
const LISTEN_TIMEOUT = 2000;
const SUSY_ID_ADDR = 18;
const SERIAL_ADDR = 20;
/** SUSy-IDs of the Sunny Home Manager 2.0, taken from adapters/sma-em.ts */
const HOME_MANAGER_SUSY_IDS = [372, 501];
const SEMP_PORT = 9765;

/**
 * True if this datagram is an SMA energy meter telegram of a Sunny Home Manager.
 *
 * @param message the raw datagram
 */
export function isHomeManager(message: Buffer): boolean {
    // "SMA" identifier, then the protocol id of the energy meter telegram
    if (message.length < SERIAL_ADDR + 4 || message.toString('ascii', 0, 3) !== 'SMA') {
        return false;
    }
    if (message.readUInt16BE(16) !== 0x6069) {
        return false;
    }
    return HOME_MANAGER_SUSY_IDS.includes(message.readUInt16BE(SUSY_ID_ADDR));
}

/**
 * Serial number of the sender, used to name the find.
 *
 * @param message the raw datagram
 */
export function homeManagerSerial(message: Buffer): string {
    return message.readUIntBE(SERIAL_ADDR, 4).toString();
}

function addInstance(managerIp: string, serial: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(options, adapterName, () => true);

    if (instance) {
        options.log.info('semp adapter already present');
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: 'SEMP gateway for the SMA Sunny Home Manager',
        },
        native: {
            // the address the Home Manager has to reach us at - it goes into the SSDP LOCATION
            IPAddress: tools.getOwnAddress(managerIp),
            // the adapter refuses to start without one and generates it the same way
            UUID: randomUUID(),
            SempPort: SEMP_PORT,
        },
        comment: {
            add: [`SMA Sunny Home Manager 2.0 S/N: ${serial} (${managerIp})`],
            text: 'Registers ioBroker appliances with the Sunny Home Manager',
        },
    });

    return true;
}

export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let found = false;

    const finish = (): void => {
        if (!callback) {
            return;
        }
        const report = callback;
        callback = null;
        try {
            client.close((): void => report(null, found, ip));
        } catch {
            report(null, found, ip);
        }
    };

    client.on('error', (e): void => {
        options.log.debug(`semp: cannot listen on ${MULTICAST_IP}:${MULTICAST_PORT}: ${e.message}`);
        finish();
    });

    client.on('message', (message, remote): void => {
        if (found || !isHomeManager(message)) {
            return;
        }
        found = addInstance(remote.address, homeManagerSerial(message), options);
        options.log.debug(`SMA Sunny Home Manager detected at ${remote.address}`);
    });

    client.bind(MULTICAST_PORT, (): void => {
        for (const dev of tools.getIP4addresses()) {
            try {
                client.addMembership(MULTICAST_IP, dev.ip);
            } catch {
                // an interface that refuses the group must not abort the scan
            }
        }
    });

    setTimeout(finish, LISTEN_TIMEOUT);
}

// the Home Manager announces itself, there is nothing to ask an address for
export const type = ['once'];
// main.ts arms its watchdog with this before it calls detect(), so leave the listener room
export const timeout = LISTEN_TIMEOUT + 300;
