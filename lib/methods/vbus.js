/**
 * Detects RESOL devices, which support the VBus discovery protocol
 * e.g., DL2, DL3, KM2, VBus/LAN
 */

// The results are devices of the form
// {
//     _addr: device_ip
//     _name: 'RESOL VBus'
//     }
// }
//
// the type of this discovery module is
// type: 'vbus'
// To identify the adapter which handles the device, dedicated detector modules are required.
//

'use strict';

//const tools = require('../tools.js');
const dgram = require('dgram');

const bcastAddress = '255.255.255.255';
const bcastPort = 7053;
const queryString = '---RESOL-BROADCAST-QUERY---';
const replyString = '---RESOL-BROADCAST-REPLY---';
const debug = false;

function discover(self) {
    debug && self.adapter.log.debug('Discovering VBus devices...');

    const socket = dgram.createSocket({type: 'udp4', reuseAddr: true});

    const addressList = [];

    socket.on('message', (msg, rinfo) => {
        if ((rinfo.family === 'IPv4') && (rinfo.port === 7053) && (msg.length >= replyString.length)) {
            const msgString = msg.slice(0, replyString.length).toString();
            if (msgString === replyString) {
                const { address } = rinfo;
                if (addressList.indexOf(address) < 0) {
                    addressList.push(address);
                    debug && self.adapter.log.debug(`VBus Device with IP ${rinfo.address} discovered...`);
                }
            }
        }
    });

    socket.bind(0, () => {
        socket.setBroadcast(true);
        const queryBuffer = Buffer.from(queryString);
        socket.send(queryBuffer, 0, queryBuffer.length, bcastPort, bcastAddress);
        debug && self.adapter.log.debug(`Send discovery request: ${queryString}`);
    });

    setTimeout(() => {
        socket.close();
        for (const address of addressList) {
            self.addDevice({
                _addr: address,
                _name: 'RESOL VBus Device',
            });
        }
        self.done();
    }, self.timeout);
}

module.exports = {
    browse: discover,
    type: 'vbus',
    source: 'RESOL VBus',
    timeout: 1500
};