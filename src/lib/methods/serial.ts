import type * as nodeFs from 'node:fs';
import type { DiscoveryDevice, MethodInstance, ProtocolData } from '../types';

/**
 * List the serial ports of this host.
 *
 * `SerialPort.list()` is asked on every platform, not only on Windows as before: on Linux it
 * is what supplies vendor and product id, manufacturer and serial number, and without those
 * a detection module can only guess from the device path. The `/dev/` scan stays as a
 * supplement - it also finds ports that carry no USB descriptor at all, such as the built-in
 * `ttyAMA0` of a Raspberry Pi - and never overwrites an entry that already has metadata.
 */
function listPorts(self: MethodInstance): void {
    const fs = require('node:fs') as typeof nodeFs;
    const known = new Map<string, DiscoveryDevice>();

    const report = (device: DiscoveryDevice): void => {
        if (known.has(device._addr)) {
            return;
        }
        known.set(device._addr, device);
        self.addDevice(device);
    };

    /** Ports found by reading the device directory - the fallback with no USB descriptor */
    const scanDevDirectory = (): void => {
        if (!fs.existsSync('/dev/')) {
            return;
        }
        try {
            for (const name of fs.readdirSync('/dev/')) {
                if (name.match(/^tty[A-Z]/) || name.match(/usb/i)) {
                    report({ _addr: `/dev/${name}`, _name: name });
                }
            }
        } catch (e) {
            self.adapter.log.warn(`Some error by listing of /dev/: ${e}`);
        }
    };

    let SerialPort;
    try {
        // optional dependency - a host without the native module still gets the /dev/ scan
        SerialPort = require('serialport').SerialPort;
    } catch {
        self.adapter.log.debug('serialport module not available, falling back to the device directory');
    }

    if (!SerialPort) {
        scanDevDirectory();
        return self.done();
    }

    SerialPort.list()
        .then((ports: ProtocolData[]): void => {
            for (const port of ports) {
                report({
                    _addr: port.path,
                    _name: port.friendlyName || port.manufacturer || port.path,
                    // vendorId, productId, manufacturer and serialNumber travel in here
                    _data: port,
                });
            }
            scanDevDirectory();
            self.done();
        })
        .catch((e: unknown): void => {
            self.adapter.log.warn(`Some error by listing of serial ports: ${String(e)}`);
            scanDevDirectory();
            self.done();
        });
}

export const browse = listPorts;
export const type = 'serial';
export const source = 'serial';

export const options = {};
