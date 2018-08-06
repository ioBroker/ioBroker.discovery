'use strict';

let adapter;

if (module && module.parent) {
    if (module.parent.exports && module.parent.exports.adapter)
        adapter = module.parent.exports.adapter;
}

function getVersionAsNumber(version) {
    if (typeof version !== 'string') return version;
    let val = 0, ar = version.split('.');
    if (ar) ar.forEach(v => val = val * 1000 + ~~v);
    return val;
}

function tr064Running(callback) {
    callback = callback || function () {};
    
    adapter.getForeignState ('system.adapter.tr-064.0.alive', function (err, state) {
        if (err || !state) {
            return callback ('tr-064.0 not installed');
        }
        
        if (state.val = false) {
            return callback ('tr-064.0 installed, but not running');
        }
        
        adapter.getForeignObject('system.adapter.tr-064.0', function (err, obj) {
            if (err || !obj) return callback('Can not get tr-064 system object');
            if (getVersionAsNumber (obj.common.installedVersion) < getVersionAsNumber('0.1.16')) {
                const _err = 'Version of installed tr.064 adapter is to low. Please update...';
                adapter.log.error(_err);
                return callback (_err);
            }
            callback (0, true);
        });
    });
}

function discoverTr064 (self) {
    if (adapter === undefined && self.adapter) adapter = self.adapter;
    self.timeout = 5000;
    self.setTimeout(self.timeout);
    
    tr064Running(function(err, running) {
        if (err) return self.done(err);
        adapter.sendTo('tr-064.0', 'discovery', { onlyActive: true }, function (result) {
            if (!result) return self.done ('no result');
            let fbDevices;
            try {
                fbDevices = JSON.parse(result);
            } catch(e) {
                return self.done ('JSON.parse exception');
            }
            if (fbDevices) fbDevices.forEach(function (device) {
                //console.log(JSON.stringify(device));
                device = {
                    _addr: device.ip,
                    _name: device.name,
                    _tr064: {
                        mac: device.mac,
                        addr: device.ip,
                        name: device.name
                    }
                };
                self.addDevice(device);
            });
            
            // stop the ping loop;
            if (self.adapter.config.stopPingOnTR064Ready && typeof self.halt === 'object') {
                self.halt['ping'] = true;
            }
            self.done();
        });
    });
}

exports.browse  = discoverTr064;
exports.type    = 'ip';
exports.source  = 'tr064'; //methodName;
exports.options = { };
