import type { RemoteInfo, Socket } from 'node:dgram';
/**
 * Detects SMA devices which support the speedwire discovery protocol
 * e.g. SMA grid inverters, battery inverters and control devices like Sunny Home Manager or Energy Meter
 */

// The results are devices of the form
// {
//     _addr: device.ip
//     }
// }
//
// the type of this discovery module is
// type: 'speedwire'
// To identify the adapter which handles the device, dedicated detector modules are required.
//

('use strict');

import * as dgram from 'node:dgram';
import * as tools from '../tools';
import type { MethodInstance, ProtocolData } from '../types';

const MULTICAST_PORT = 9522;
const MULTICAST_IP = '239.12.255.254';
const discoveryRequest = '534d4100000402a0ffffffff0000002000000000';
const discoveryResponse = '534d4100000402a000000001000200000001';
const debug = false;

/* @param {dgram.Socket} socket The UDP socket to send the message on
 * @param {string | Buffer} msg The message to send
 * @param {string} ip The IP to send the message to
 */
function send(socket: Socket, msg: ProtocolData, ip: string): void {
    if (typeof msg === 'string') {
        msg = Buffer.from(msg, 'hex');
    }
    socket.send(msg, 0, msg.length, MULTICAST_PORT, ip);
}

function discover(self: MethodInstance): void {
    debug && self.adapter.log.debug('Discovering devices with speedwire support...');

    const result = new Map();
    /**
     * Handles a response from a device
     *
     * @param msg The received message
     * @param rinfo Information about the other endpoint
     */
    function handleDiscoverResponse(msg: ProtocolData, rinfo: RemoteInfo): void {
        if (msg.length && rinfo.port === 9522) {
            const msgAsString = msg.toString('hex');
            if (rinfo.address && tools.startsWith(msgAsString, discoveryResponse)) {
                result.set(rinfo.address, rinfo.address);
                debug && self.adapter.log.debug(`SMA Device with ${result.get(rinfo.address)} discovered...`);
            }
        }
    }

    const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    client.bind(MULTICAST_PORT, (): void => {
        // listen on SMA multicast port
        client.setMulticastLoopback(false);
        const addresses = tools.getIP4addresses();
        for (const dev of addresses) {
            debug &&
                self.adapter.log.debug(
                    `Listen via UDP on Device ${dev.name} with IP ${dev.ip} on Port ${MULTICAST_PORT} for Multicast IP ${MULTICAST_IP}`,
                );
            client.addMembership(MULTICAST_IP, dev.ip);
        }
        send(client, discoveryRequest, MULTICAST_IP);
        debug && self.adapter.log.debug(`Send discovery request: ${discoveryRequest}`);
    });

    client.on('error', e => (self.adapter.log as any).console.error(e)); // log error
    client.on('message', handleDiscoverResponse);

    setTimeout((): void => {
        client.close();
        for (const address of result.values()) {
            self.addDevice({
                _addr: address,
                _name: 'SMA Speedwire',
            });
        }
        self.done();
    }, self.timeout);
}

export const browse = discover;
export const type = 'speedwire';
export const source = 'SMA Speedwire';
export const timeout = 5000;
