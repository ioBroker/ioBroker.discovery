var Mdns, dns;

var adapter;

if (module && module.parent) {
    if (module.parent.exports && module.parent.exports.adapter)
        adapter = module.parent.exports.adapter;
}

function getVersionAsNumber(version) {
    if (typeof version !== 'string') return version;
    var val = 0, ar = version.split('.');
    if (ar) ar.forEach(function(v) {
        val = val * 1000 + ~~v;
    });
    return val;
}

function tr064Running(callback) {
    callback = callback || function () {};
    adapter.getForeignState ('system.adapter.tr-064.0.alive', function (err, state) {
        if (err || !state) return callback ('tr-064.0 not installed');
        if (state.val = false) return callback ('tr-064.0 installed, but not running');
        adapter.getForeignObject('system.adapter.tr-064.0', function (err, obj) {
            if (err || !obj) return callback('Can not get tr-064 system object');
            if (getVersionAsNumber (obj.common.installedVersion) < getVersionAsNumber('0.1.16')) {
                var err = 'Version of installed tr.064 adapter is to low. Please update...';
                adapter.log.error(err);
                return callback (err);
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
        if (err) return doReturn(err);
        adapter.sendTo('tr-064.0', 'discovery', { onlyActive: true }, function (result) {
            if (!result) return doReturn ('no result');
            var fbDevices;
            try {
                fbDevices = JSON.parse(result);
            } catch(e) {
                return doReturn ('JSON.parse exception');
            }
            var cnt = fbDevices.length;
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
            if (self.adapter.config.stopPingOnTR064Ready && typeof self.halt === 'object') self.halt['ping'] = true;
            self.done();
        });
    });
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// can be removed in the feature
function old_discoverTr064(options, log, progressCallback, addDevice) {
    if (adapter === undefined && options.adapter) adapter = options.adapter;
    
    function doReturn(err, val) {
        if (timer) clearTimeout(timer);
        timer = null;
        addDevice && addDevice(null, err);
        addDevice = null;
    }
    var timer = setTimeout(function() {
        timer = null;
        doReturn('timeout');
    }, 5000);
    
    tr064Running(function(err, running) {
        if (err) return doReturn(err);
        adapter.sendTo('tr-064.0', 'discovery', { onlyActive: true }, function (result) {
            if (!result) return doReturn ('no result');
            var fbDevices;
            try {
                fbDevices = JSON.parse(result);
            } catch(e) {
                return doReturn ('JSON.parse exception');
            }
            var cnt = fbDevices.length;
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
                addDevice && addDevice(device);
            });
            
            // stop the ping loop;
            if (options.halt['ping'] !== false) options.halt['ping'] = true;
            doReturn(null);
        });
    });
}
exports.foundCount = 0;  // if needed, do only read
exports.progress = 0;
// end
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.browse  = discoverTr064;
exports.old_browse  = old_discoverTr064;
exports.type    = 'ip';
exports.source  = 'tr064'; //methodName;

exports.options = { };
