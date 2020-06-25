'use strict';
const tools = require('../tools.js');

function getXml(url, cb) {
    tools.httpGet(url, (error, data) => {
        if (!error && data) {
            const nameData = data.match(/<modelDescription>(.*?)<\/modelDescription>/);
            const modelData = data.match(/<modelNumber>(.*?)<\/modelNumber>/);
            const portData = data.match(/<URLBase.*>(.*?(\d+))<\/URLBase>/);
            const param = {
                name:  nameData[1] ? nameData[1] : '',
                model: modelData[1] ? modelData[1] : '',
                port:  portData[2] ? portData[2] : ''
            };

            cb && cb(param);
        } else {
            cb && cb(null);
        }
    });
}

function addDevice(ip, upnp, options){
    let instance = tools.findInstance(options, 'synology', obj => obj.native.ip === ip);

    getXml(upnp.LOCATION, param => {
        if (!instance && param) {
            const id = tools.getNextInstanceID('synology', options);
            instance = {
                _id:     id,
                common:  {
                    name:    'synology',
                    enabled: false,
                    title:   obj => obj.common.title
                },
                comment: {
                    add: [param.name, param.model, ip]
                }
            };

            options.newInstances.push(instance);

            instance.native = {
                host:     ip,
                port:     param.port,
                login:    'admin',
                password: '',
                https:    false,
                version:  '6.0.2',
                polling:  5000
            };
            return true;
        } else {
            return false;
        }
    });
}

function detect(ip, device, options, callback) {
    let foundInstance = false;
    device._upnp.forEach(upnp => {
        if (upnp.ST === 'upnp:rootdevice' && upnp.SERVER.includes('Synology')){
            options.log.debug(JSON.stringify(upnp));
            if (addDevice(ip, upnp, options)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

exports.detect = detect;
exports.type = ['upnp'];
exports.timeout = 5000;
