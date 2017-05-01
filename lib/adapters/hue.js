var tools = require(__dirname + '/../tools.js');
function addHue(ip, device, options, callback) {
    var ownIp = tools.getOwnAddress(ip);

    var instance = tools.findInstance(options, 'hue', function (obj) {
        if (obj && obj.native && (obj.native.webServer === ownIp || obj.native.webServer === device._name)) {
            return true;
        }
    });

    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('hue', options),
            common: {
                name: 'hue'
            },
            native: {
                bridge: ip
            },
            comment: {
                add: [tools.translate(options.language, 'for %s', tools.getOwnAddress(ip))],
                inputs: [
                    {
                        name: 'native.user',
                        def: '',
                        type: 'text', // text, checkbox, number, select, password. Select requires
                        title: 'user' // see translation in words.js
                    }
                ]
            }
        };
        options.newInstances.push(instance);
        callback(true);
    } else {
        callback(false);
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }
    // options.language - language
    if (device._upnp && device._upnp['HUE-BRIDGEID'] && device._upnp.LOCATION && device._upnp.LOCATION.indexOf(ip) !== -1) {
        // {
        //   HOST: "239.255.255.250:1900",
        //   EXT: "",
        //   CACHE-CONTROL: "max-age=100",
        //   LOCATION: "http://192.168.1.74:80/description.xml",
        //   SERVER: "Linux/3.14.0 UPnP/1.0 IpBridge/1.16.0",
        //   HUE-BRIDGEID: "001788FFFE4EBD77",
        //   ST: "uuid:2f402f80-da50-11e1-9b23-0017884ebd77",
        //   USN: "uuid:2f402f80-da50-11e1-9b23-0017884ebd77",
        // }
        addHue(ip, device, options, function (isAdded) {
            callback && callback(null, isAdded, ip);
        });
    } else {
        callback && callback(null, false, ip);
    }
}

exports.detect = detect;
exports.type = ['ip', 'upnp'];// make type=serial for USB sticks
