'use strict';

const tools = require('../tools.js');
const dgram = require('dgram');
const adapterName = 'sma-em';
const MULTICAST_PORT = 9522;
const MULTICAST_IP = '239.12.255.254';
const EM_TIMEOUT = 2000; // longest interval between EM multicasts is 1000 ms
const protocol_points = {
    'SMASusyID': {name: 'SMA Device SUSy-ID', addr: 18, length: 2, type: 'number', unit: ''},
    'SMASerial': {name: 'SMA Device Serial Number', addr: 20, length: 4, type: 'number', unit: ''}
};


let client = null;

function addInstance(ip, device, options) {
    let instance = tools.findInstance (options, adapterName, obj => obj.native.EMIP === ip);

    if (instance) {
        options.log.debug(`sma-em adapter already present for Energy Meter IP ${ip}`);
    } else {
        instance = {
            _id: tools.getNextInstanceID(adapterName, options),
            common: {
                name: adapterName,
                title: `SMA Energy Meter`
            },
            native: {
                EMIP: ip,
                OIP: '0.0.0.0'
            },
            comment: {
                add: [`SMA Energy Meter Device  ${device._name} (${ip})`]
            }
        };
        options.newInstances.push(instance);
        options.log.debug(`New Energy Meter ${device._name} with IP ${ip} detected.`);
        return true;
    }
    return false;
}

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger

    options.log.debug(`Detecting SMA Energy Meters broadcasting on ${MULTICAST_IP}/${MULTICAST_PORT}...`);
    // Listen for EM broadcasts until timeout
    client = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    client.on('error', err => {
        options.log.error(`SMA-EM rxSocket error:${err.stack}`);
        cleanup(ip, callback, false);
        callback = null;
    });

    client.on('message', (message, remote) => {
        options.log.debug(`UDP datagram from ${remote.address}:${remote.port}`);
        if (check_message_type(message) === false)
            return; // discard message if not EM protocol

        const ser = message.readUIntBE(protocol_points['SMASerial'].addr, protocol_points['SMASerial'].length);
        const ser_str = ser.toString();
        // determine device type
        const susy = message.readUIntBE(protocol_points['SMASusyID'].addr, protocol_points['SMASusyID'].length);

        let dev_descr = ('Unkown Energy Meter device S/N: ' + ser_str);
        if (susy == 372  || susy == 501) {
            dev_descr = ('Sunny Home Manager 2.0 S/N: ' + ser_str);
        } 
        if (susy == 349) {
            dev_descr = ('SMA Energy Meter 2.0 S/N: ' + ser_str);
        } 
        if (susy == 270) {
            // eslint-disable-next-line no-unused-vars
            dev_descr = ('SMA Energy Meter 1.0 S/N: ' + ser_str);
        }
        device._name = dev_descr;

        addInstance(remote.address, device, options);
    });


    // Bind socket to the multicast address on all ipv4 devices except localhost
    client.bind(MULTICAST_PORT, () => {
        for (const dev of findIPv4IPs()) {
            options.log.debug(`Listen via UDP on Device ${dev.name} with IP ${dev.ipaddr} on Port ${MULTICAST_PORT} for Multicast IP ${MULTICAST_IP}`);
            client.addMembership(MULTICAST_IP, dev.ipaddr);
        }
    });

    // stop listening for Energy Meters if timeout reached
    setTimeout(() => {
        options.log.debug('EM timeout reached');
        cleanup(ip, callback, false);
        callback = null;
    }, EM_TIMEOUT);
}

function cleanup(ip, callback, callbackResult) {
    if (client) {
        client.close(() =>
            callback && callback(null, callbackResult, ip));

        client = null;
    } else {
        callback && callback(null, callbackResult, ip);
    }
}

function findIPv4IPs() {
    // Get all network devices
    const ifaces = require('os').networkInterfaces();
    const net_devs = [];

    for (const dev in ifaces) {
        // eslint-disable-next-line no-prototype-builtins
        if (ifaces.hasOwnProperty(dev)) {
            
            // Read IPv4 address properties of each device by filtering for the IPv4 external interfaces
            ifaces[dev].forEach(details => {
                if (!details.internal && details.family === 'IPv4') {
                    net_devs.push({name: dev, ipaddr: details.address});
                }
            });
        }
    }
    return net_devs;
}

function check_message_type(message) {
    // Check SMA ident string at the first 0 bytes
    if(message.toString('ascii', 0, 3) !=  'SMA')
        return false;

    // Check protocol type
    if(message.readUInt16BE(16) != 0x6069)
        return false;

    return true;
}


exports.detect = detect;
exports.type = ['once'];     // SMA Energy Meters send out multicast messages on regular intervals 
exports.timeout = EM_TIMEOUT + 100; // Make sure that internal timeout strikes first
