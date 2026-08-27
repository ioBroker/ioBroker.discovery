import type { RemoteInfo, Socket } from 'node:dgram';
/**
 * Detects Wi-Fi devices with the HF-LPB100 chip like
 * Mi-Light and G-Homa
 */

// The results are devices of the form
// {
//     _addr: device.ip,
//     _name: device.type, // usually 'HF-LPB100'
//     _hf_lpb100: {
//         mac: device.mac,
//         type: device.type, // usually 'HF-LPB100'
//         networkSettings: device.networkSettings, // the response to AT+NETP\r... empty for MiLight, contains G-Homa network settings
//     }
// }

('use strict');

import * as dgram from 'node:dgram';
import * as tools from '../tools';
import type { MethodInstance, ProtocolData } from '../types';

const DISCOVERY_PORT = 48899;
const PASSWORD = 'HF-A11ASSISTHREAD';

/**
 * Sends a message via UDP to the given IP
 *
 * @param socket The UDP socket to send the message on
 * @param msg The message to send
 * @param ip The IP to send the message to
 */
function send(socket: Socket, msg: ProtocolData, ip: string): void {
    if (typeof msg === 'string') {
        msg = Buffer.from(msg, 'ascii');
    }
    socket.send(msg, 0, msg.length, DISCOVERY_PORT, ip);
}

/**
 * Parses a received response
 */
function parseHelloResponse(response: ProtocolData): ProtocolData {
    try {
        const parts = response.split(',');
        return {
            ip: parts[0],
            mac: parts[1],
            type: parts[2],
        };
    } catch {
        return null;
    }
}

function discover(self: MethodInstance): void {
    self.adapter.log.info('Discovering devices with a HF-LPB100 chipset...');

    const result = new Map();
    /**
     * Handles a response from a device
     *
     * @param msg The received message
     * @param rinfo Information about the other endpoint
     */
    function handleDiscoverResponse(msg: ProtocolData, rinfo: RemoteInfo): void {
        if (msg.length && rinfo.port === 48899) {
            const msgAsString = msg.toString('ascii');
            if (tools.startsWith(msgAsString, rinfo.address)) {
                // The response to the 'hello' starts with the IP
                const response = parseHelloResponse(msgAsString);
                if (response) {
                    result.set(response.ip, response);
                }
                // We want to find out some more about the device
                // acknowledge the response
                // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the handler only runs after the declaration below
                send(socket, '+ok', rinfo.address);
                // and ask about the server info
                setTimeout((): void => {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the handler only runs after the declaration below
                        send(socket, 'AT+NETP\r', rinfo.address);
                    } catch (err) {
                        self.adapter.log.info(`HF-LPB100: error sending discovery packet: ${err}`);
                    }
                }, 100);
            } else if (result.has(rinfo.address) && tools.startsWith(msgAsString, '+ok=')) {
                // This is the response to AT+NETP\r
                // store it
                result.get(rinfo.address).networkSettings = msgAsString.substr(4);
            }
        }
    }

    const socket = dgram
        .createSocket({ type: 'udp4', reuseAddr: true })
        .once('listening', (): void => {
            socket.setBroadcast(true);
            const broadcastAddresses = tools.getBroadcastAddresses();
            // Start interview with all devices reachable under each broadcast address
            broadcastAddresses.forEach(address => send(socket, PASSWORD, address));
        })
        .on('error', e => (self.adapter.log as any).console.error(e)) // log error
        .on('message', handleDiscoverResponse);

    socket.bind(0); // listen on a random free port

    setTimeout(
        (): void => {
            socket.close();
            const values = result.values();
            for (const device of values) {
                self.addDevice({
                    _addr: device.ip,
                    _name: device.type,
                    _hf_lpb100: {
                        mac: device.mac,
                        type: device.type,
                        networkSettings: device.networkSettings,
                    },
                });
            }
            self.done();
        },
        (self.options as any).timeout || 10000,
    );
}

export const browse = discover;
export const type = 'hf-lpb100';
export const source = 'HF-LPB100';
export const timeout = 10000;
