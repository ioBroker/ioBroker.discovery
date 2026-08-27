'use strict';

/**
 * Tests for the GoodWe detection file (lib/adapters/goodwe.js).
 *
 * The inverter answers on UDP only, so the detection cannot rely on an open
 * TCP port. A local UDP responder stands in for the inverter.
 */

const expect = require('chai').expect;
const dgram = require('node:dgram');
const path = require('node:path');
const goodwe = require(path.join('..', '..', 'lib', 'adapters', 'goodwe.js'));

const GOODWE_UDP_PORT = 8899;

function freshOptions() {
    return {
        newInstances: [],
        existingInstances: [],
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

// GoodWe API v1.7, 4.1: inverter -> AP "response ID info" packet.
function buildIdInfoResponse(modelName, serialNumber) {
    const response = Buffer.alloc(73);

    response[0] = 0xaa;
    response[1] = 0x55;
    response[2] = 0x7f;
    response[3] = 0xc0;
    response[4] = 0x01;
    response[5] = 0x82;
    response.write(modelName, 12, 10, 'ascii');
    response.write(serialNumber, 38, 16, 'ascii');

    let checksum = 0;
    for (let index = 0; index < response.length - 2; index++) {
        checksum += response[index];
    }
    response[response.length - 2] = (checksum >> 8) & 0xff;
    response[response.length - 1] = checksum & 0xff;

    return response;
}

function startResponder(answerFactory) {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');

        socket.on('error', reject);
        socket.on('message', (message, remote) => {
            const answer = answerFactory(message);

            if (answer) {
                socket.send(answer, remote.port, remote.address);
            }
        });
        socket.bind(GOODWE_UDP_PORT, '127.0.0.1', () => resolve(socket));
    });
}

// Receives on the probed address but answers from a second loopback address, so that the
// detection sees a valid GoodWe frame with a foreign remote.address.
function startSpoofingResponder(answerFactory) {
    const sender = dgram.createSocket('udp4');

    return new Promise((resolve, reject) => {
        const receiver = dgram.createSocket('udp4');
        const close = () => {
            receiver.close();
            sender.close();
        };

        receiver.on('error', reject);
        sender.on('error', reject);
        receiver.on('message', (message, remote) => {
            const answer = answerFactory(message);

            if (answer) {
                sender.send(answer, remote.port, remote.address);
            }
        });
        sender.bind(0, '127.0.0.2', () =>
            receiver.bind(GOODWE_UDP_PORT, '127.0.0.1', () => resolve({ close })),
        );
    });
}

function detect(options) {
    return new Promise(resolve => {
        goodwe.detect('127.0.0.1', {}, options, (err, found) => resolve({ err, found }));
    });
}

describe('GoodWe detection', () => {
    it('builds the ID info request accepted by the inverter', () => {
        expect([...goodwe.buildIdInfoRequest()]).to.deep.equal([
            0xaa, 0x55, 0xc0, 0x7f, 0x01, 0x02, 0x00, 0x02, 0x41,
        ]);
    });

    it('rejects short, foreign and corrupted answers', () => {
        const response = buildIdInfoResponse('GW10K-ET', '9010KETU231W1723');

        expect(goodwe.isIdInfoResponse(response)).to.be.true;
        expect(goodwe.isIdInfoResponse(response.slice(0, 40))).to.be.false;
        expect(goodwe.isIdInfoResponse(Buffer.alloc(73))).to.be.false;

        const corrupted = Buffer.from(response);
        corrupted[20] = corrupted[20] ^ 0xff;
        expect(goodwe.isIdInfoResponse(corrupted)).to.be.false;
    });

    it('creates an instance for an answering inverter', async function () {
        this.timeout(5000);

        const responder = await startResponder(() => buildIdInfoResponse('GW10K-ET', '9010KETU231W1723'));
        const options = freshOptions();

        try {
            const { err, found } = await detect(options);

            expect(err).to.be.null;
            expect(found).to.be.true;
            expect(options.newInstances).to.have.lengthOf(1);
            expect(options.newInstances[0].native.ipAddr).to.equal('127.0.0.1');
            expect(options.newInstances[0].common.name).to.equal('goodwe');
            expect(options.newInstances[0].common.title).to.contain('GW10K-ET');
            expect(options.newInstances[0].common.title).to.contain('9010KETU231W1723');
        } finally {
            responder.close();
        }
    });

    it('ignores a device that answers something else', async function () {
        this.timeout(5000);

        const responder = await startResponder(() => Buffer.from('not a goodwe inverter'));
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            expect(found).to.be.false;
            expect(options.newInstances).to.be.empty;
        } finally {
            responder.close();
        }
    });

    it('ignores a valid answer that comes from another address', async function () {
        this.timeout(5000);

        const responder = await startSpoofingResponder(() => buildIdInfoResponse('GW10K-ET', '9010KETU231W1723'));
        const options = freshOptions();

        try {
            const { found } = await detect(options);

            expect(found).to.be.false;
            expect(options.newInstances).to.be.empty;
        } finally {
            responder.close();
        }
    });

    it('does not add a second instance for an already configured inverter', async function () {
        this.timeout(5000);

        const responder = await startResponder(() => buildIdInfoResponse('GW10K-ET', '9010KETU231W1723'));
        const options = freshOptions();

        options.existingInstances.push({
            _id: 'system.adapter.goodwe.0',
            common: { name: 'goodwe' },
            native: { ipAddr: '127.0.0.1' },
        });

        try {
            const { found } = await detect(options);

            expect(found).to.be.false;
            expect(options.newInstances).to.be.empty;
        } finally {
            responder.close();
        }
    });
});
