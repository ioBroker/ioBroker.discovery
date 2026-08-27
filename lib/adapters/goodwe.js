'use strict';

const tools = require('../tools.js');
const dgram = require('node:dgram');

const adapterName = 'goodwe';
const GOODWE_UDP_PORT = 8899;
const GOODWE_TIMEOUT = 700;

// GoodWe API v1.7, 4.1: AP -> inverter "query ID info" packet.
// Header 0xAA 0x55, from AP 0xC0 to inverter 0x7F, control 0x01, function 0x02,
// no payload, followed by the 16 bit sum of all preceding bytes.
const ID_INFO_REQUEST = buildIdInfoRequest();

function checksum16(data, start, length) {
    let checksum = 0;

    for (let index = start; index < start + length; index++) {
        checksum += data[index];
    }

    return checksum & 0xffff;
}

function buildIdInfoRequest() {
    const request = Buffer.from([0xaa, 0x55, 0xc0, 0x7f, 0x01, 0x02, 0x00, 0x00, 0x00]);
    const checksum = checksum16(request, 0, request.length - 2);

    request[request.length - 2] = checksum >> 8;
    request[request.length - 1] = checksum & 0xff;

    return request;
}

function isIdInfoResponse(data) {
    if (!Buffer.isBuffer(data) || data.length < 73) {
        return false;
    }

    const expected = checksum16(data, 0, data.length - 2);
    const actual = (data[data.length - 2] << 8) + data[data.length - 1];

    return (
        actual === expected &&
        data[0] === 0xaa &&
        data[1] === 0x55 &&
        data[2] === 0x7f &&
        data[3] === 0xc0 &&
        data[4] === 0x01 &&
        data[5] === 0x82
    );
}

function readAscii(data, start, length) {
    return data
        .slice(start, start + length)
        .toString('ascii')
        .replace(/\0/g, '')
        .trim();
}

function buildTitle(ip, response) {
    const modelName = readAscii(response, 12, 10);
    const serialNumber = readAscii(response, 38, 16);
    const details = [modelName, serialNumber].filter(part => part).join(' ');

    return details ? `GoodWe ${details} (${ip})` : `GoodWe inverter (${ip})`;
}

function addInstance(ip, response, options) {
    const instance = tools.findInstance(options, adapterName, obj => obj.native.ipAddr === ip);

    if (instance) {
        options.log.info(`GoodWe adapter already present for IP ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: buildTitle(ip, response),
        },
        native: {
            ipAddr: ip,
        },
        comment: {
            add: ['read your GoodWe ET/EH/BH/BT inverter over the local network'],
        },
    });

    return true;
}

function detect(ip, device, options, callback) {
    options.log.debug(`Detecting GoodWe inverter on ${ip}...`);

    const socket = dgram.createSocket('udp4');
    let timeout = null;
    let done = false;

    function finish(found) {
        if (done) {
            return;
        }

        done = true;

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }

        try {
            socket.close(() => callback(null, found, ip));
        } catch (e) {
            options.log.debug(`GoodWe socket close failed for ${ip}: ${e}`);
            callback(null, found, ip);
        }
    }

    timeout = setTimeout(() => {
        options.log.debug(`GoodWe timeout reached for ${ip}`);
        finish(false);
    }, GOODWE_TIMEOUT);

    socket.on('error', err => {
        options.log.debug(`GoodWe socket error for ${ip}: ${err}`);
        finish(false);
    });

    socket.on('message', message => {
        if (!isIdInfoResponse(message)) {
            options.log.debug(`GoodWe ignored a non matching UDP answer from ${ip}`);
            return;
        }

        finish(addInstance(ip, message, options));
    });

    socket.send(ID_INFO_REQUEST, GOODWE_UDP_PORT, ip, err => {
        if (err) {
            options.log.debug(`GoodWe request to ${ip} failed: ${err}`);
            finish(false);
        }
    });
}

exports.detect = detect;
exports.type = ['ip']; // the inverter answers on UDP only, so every reachable IP is probed
exports.timeout = GOODWE_TIMEOUT;
exports.buildIdInfoRequest = buildIdInfoRequest;
exports.isIdInfoResponse = isIdInfoResponse;
