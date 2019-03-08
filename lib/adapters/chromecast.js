'use strict';

const tools = require('../tools.js');

function addChromecast(ip, device, options) {
    options.log.debug("chromecast FOUND!");
    const ownIp = tools.getOwnAddress(ip);

    let instance = tools.findInstance(options, 'chromecast', obj =>
        obj && obj.native && (obj.native.webServer === ownIp || obj.native.webServer === device._name));
    
    if (!instance) {
        // chromecast required web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web');
        let visInstance = tools.findInstance(options, 'vis');

        const id = tools.getNextInstanceID('chromecast', options);

        if (!webInstance) {
            webInstance = {
                _id: tools.getNextInstanceID('web', options),
                common: {
                    name: 'web',
                    title: 'ioBroker web Adapter with no security'
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))]
                }
            };
            options.newInstances.push(webInstance);
        }

        if (!visInstance) {
            visInstance = {
                _id: tools.getNextInstanceID('vis', options),
                common: {
                    name: 'vis',
                    title: 'ioBroker vis Adapter'
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))],
                    required: [webInstance._id]
                }
            };
            options.newInstances.push(visInstance);
        }

        instance = {
            _id: id,
            common: {
                name: 'chromecast'
            },
            native: {
                useSSDP: true,
                web: webInstance._id,
                webServer: ownIp
            },
            comment: {
                add: [tools.translate(options.language, 'for %s', ip)],
                required: [webInstance._id, visInstance._id]
            }
        };
        options.newInstances.push(instance);
        return true
    } else {
        return false;
    }
}

// just check if IP exists
function detect(ip, device, options, callback) {
    let foundInstance = false;
    options.log.debug(JSON.stringify(device));
    
    device._upnp.forEach(function(upnp) {
        options.log.debug(upnp.ST);
        if(upnp.ST && upnp.ST == "urn:dial-multiscreen-org:service:dial:1")
        {
            if(addChromecast(ip, device, options))
                foundInstance = true;
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];// make type=serial for USB sticks // TODO make to upnp
