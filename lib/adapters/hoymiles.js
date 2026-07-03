'use strict';

const net = require('node:net');
const tools = require('../tools.js');

// Minimal Hoymiles HM protocol helpers (no external dependencies)
function encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
}

function crc16(data) {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
        }
    }
    return crc;
}

function buildInfoRequest() {
    const payload = Buffer.concat([
        Buffer.from([0x10]),
        encodeVarint(28800), // offset = 28800
        Buffer.from([0x28]),
        encodeVarint(Math.floor(Date.now() / 1000)), // time
    ]);
    const crc = crc16(payload);
    const totalLen = 10 + payload.length;
    const header = Buffer.alloc(10);
    header[0] = 0x48;
    header[1] = 0x4d; // "HM"
    header[2] = 0xa3;
    header[3] = 0x01; // InfoData request
    header[4] = 0x00;
    header[5] = 0x01; // flags
    header[6] = (crc >> 8) & 0xff;
    header[7] = crc & 0xff;
    header[8] = (totalLen >> 8) & 0xff;
    header[9] = totalLen & 0xff;
    return Buffer.concat([header, payload]);
}

function addInstance(ip, dtuSn, options) {
    options.newInstances.push({
        _id: tools.getNextInstanceID('hoymiles', options),
        common: {
            name: 'hoymiles',
            title: `Hoymiles HMS (${dtuSn || ip})`,
        },
        native: {
            enableLocal: true,
            devices: [{ host: ip, enabled: true }],
            dataInterval: 5,
            slowPollFactor: 6,
        },
        comment: {
            add: ['Hoymiles HMS Inverter', dtuSn ? `${dtuSn} @ ${ip}` : ip],
        },
    });
    return true;
}

function detect(ip, device, options, callback) {
    const isDuplicate = tools.findInstance(options, 'hoymiles', obj => {
        const devices = obj.native && obj.native.devices;
        if (Array.isArray(devices) && devices.some(d => d && d.host === ip)) {
            return true;
        }
        // legacy v0.2.0 flat config (host as top-level native field)
        return obj.native && obj.native.host === ip;
    });
    if (isDuplicate) {
        callback(null, false, ip);
        return;
    }

    const socket = new net.Socket();
    socket.setTimeout(1500);

    socket.on('connect', () => socket.write(buildInfoRequest()));

    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        if (
            buffer.length >= 10 &&
            buffer[0] === 0x48 &&
            buffer[1] === 0x4d &&
            buffer[2] === 0xa2 &&
            buffer[3] === 0x01
        ) {
            socket.destroy();
            // Extract DTU serial from protobuf (field 1, length-delimited string)
            let dtuSn = '';
            try {
                const payload = buffer.slice(10);
                if (payload[0] === 0x0a) {
                    dtuSn = payload.slice(2, 2 + payload[1]).toString('ascii');
                }
            } catch {
                // ignore
            }
            addInstance(ip, dtuSn, options);
            callback(null, true, ip);
        }
    });

    socket.on('timeout', () => {
        socket.destroy();
        callback(null, false, ip);
    });
    socket.on('error', () => {
        socket.destroy();
        callback(null, false, ip);
    });
    socket.connect(10081, ip);
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 2000;
