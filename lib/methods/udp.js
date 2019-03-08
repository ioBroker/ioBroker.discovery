'use strict';

const tools = require('../tools.js');

function discover(self) {
    self.setTimeout(self.timeout);

    self.addDevice({
        //_data: rinfo,
        _addr: "255.255.255.255",
        _name: '',
    });
}

exports.browse = discover;
exports.type = 'udp';
exports.source = 'udp';
exports.timeout = 5000;