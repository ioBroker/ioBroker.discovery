'use strict';
const tools = require('../tools.js');

function getXml(url, cb) {
    tools.httpGet(url, (error, data) => {
        if (!error && data) {
            const nameData = data.match(/<modelDescription>(.*?)<\/modelDescription>/);
            const modelData = data.match(/<modelNumber>(.*?)<\/modelNumber>/);
            const portData = data.match(/<URLBase.*>(.*?(\d+))<\/URLBase>/);
            const param = {
                name:  nameData && nameData[1] ? nameData[1] : '',
                model: modelData && modelData[1] ? modelData[1] : '',
                port:  portData && portData[2] ? portData[2] : ''
            };

            cb && cb(param);
        } else {
            cb && cb(null);
        }
    });
}

function addDevice(ip, upnp, options, callback) {
    let instance = tools.findInstance(options, 'synology', obj => obj.native.host === ip);

    if (instance) {
        return false;
    }
    getXml(upnp.LOCATION, param => {
        let instance = tools.findInstance(options, 'synology', obj => obj.native.host === ip);
        if (!instance && param) {
            const id = tools.getNextInstanceID('synology', options);
            instance = {
                _id:     id,
                common:  {
                    name:    'synology',
                    enabled: false,
                    title:   obj => obj.common.title
                },
                native: {
                    host:     ip,
                    port:     param.port,
                    login:    '',
                    password: '',
                    https:    false,
                    version:  '',
                    polling:  5000
                },
                comment: {
                    add: [param.name, param.model, ip]
                }
            };

            options.newInstances.push(instance);

            callback && callback(null, true, ip);
        } else {
            callback && callback(null, false, ip);
        }
    });
    return true;
}

function detect(ip, device, options, callback) {
    for (let upnp of device._upnp) {
        if (upnp.ST === 'upnp:rootdevice' && upnp.SERVER.includes('Synology')){
            options.log.debug('Synology UPnP Data: ' + JSON.stringify(upnp));
            if (addDevice(ip, upnp, options, callback)) {
                return;
            }
        }
    }

    callback(null, false, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 5000;
