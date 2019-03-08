'use strict';

const tools = require('../tools.js');

function discover(self) {
    self.setTimeout(self.timeout);



    const obj = {
        //_data: rinfo,
        _addr: "255.255.255.255",
        _name: '',
    };
    
    self.addDevice(obj);
}

exports.browse = discover;
exports.type = 'udp';
exports.source = 'udp';
exports.timeout = 5000;