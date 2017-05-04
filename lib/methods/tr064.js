var Mdns, dns;

var adapter;

if (module && module.parent) {
    if (module.parent.exports && module.parent.exports.adapter)
        adapter = module.parent.exports.adapter;
}

function tr064Running(callback) {
    adapter.getForeignState ('system.adapter.tr-064.0.alive', function (err, state) {
        if (err || !state) return callback && callback ('tr-064.0 not installed');
        if (state.val = false) return callback && callback ('tr-064.0 installed, but not running');
        callback && callback (0, true)
    });
}

function discoverTr064(options, log, progressCallback, addDevice) {
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
        adapter.sendTo('tr-064.0', 'discovery', 'onlyActive', function (result) {
            if (!result) return doReturn ('no result');
            var fbDevices;
            try {
                fbDevices = JSON.parse(result);
            } catch(e) {
                return doReturn ('JSON.pars exception');
            }
            //var result = [];
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
                //result.push(device);
                addDevice && addDevice(device);
            });
            
            // stop the ping loop;
            if (options.halt['ping'] !== false) options.halt['ping'] = true;
            doReturn(null);
        });
    });
}

exports.browse  = discoverTr064;
exports.type    = 'ip';
exports.source  = 'tr064'; //methodName;
exports.foundCount = 0;
exports.progress = 0;

exports.options = {
    tr064Timeout: {
        min: 5000,
        max: 10000,
        type: 'number'
    }
};
