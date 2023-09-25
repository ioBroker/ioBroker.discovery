'use strict';

const tools = require('../tools.js');


//const port80 = ':80';
const port3000 = ':3000';

const debug = false;

function parseDeviceInformation(string) {
    const result = {};

    const re = /([\w]+)[\s]*=[\s]*"([^"\r\n]*)"/g;

    let md;
    while ((md = re.exec(string)) !== null) {
        result [md [1]] = md [2];
    }

    return result;
}


function detect(ip, device, options, callback) {
    if (device._source !== 'RESOL VBus') return callback(null, false, ip);
    if (debug) options.log.debug(`Start detecting VBus device information on ${ip}...`);

    const port = port3000;

    const devInfoURL = 'http://' + ip + port + '/cgi-bin/get_resol_device_information';

    if (debug) options.log.debug(`Device Information URL ${devInfoURL}`);

    tools.httpGet(devInfoURL, 2000, (err, data) => {
        //if (debug) options.log.debug(`Device Information of ${ip} ` + data);
        const devInfo = parseDeviceInformation(data);
        if (debug) options.log.debug(`Parsed Device Information of ${ip} ` + JSON.stringify(devInfo));
        if (!err && data && devInfo) {
            
            let instance = tools.findInstance (options, 'resol', obj => obj.native.connectionIdentifier === ip);
            if (!instance) {
                const name = device._name ? devInfo.name ? devInfo.name : device._name : '';
                device._name = name;
                let deviceType = 'lan';
                if (devInfo.product === 'DL2' || devInfo.product === 'KM2') {
                    deviceType = 'dl2';
                } else if (devInfo.product === 'DL3') {
                    deviceType = 'dl3';
                }                
                //if (debug) options.log.debug(`Device ` + name + ' ' + JSON.stringify(device));
                
                instance = {
                    _id: tools.getNextInstanceID ('resol', options),
                    common: {
                        name: 'resol',
                        title: 'RESOL Device (' + ip + (name ? (' - ' + name) : '') + ')'
                    },
                    native: {
                        connectionIdentifier: ip,
                        connectionDevice: deviceType,
                        vbusPassword: 'vbus'
                    },
                    comment: {
                        add: [`${devInfo.vendor} ${name} (${ip})`]
                    }
                };
                options.newInstances.push (instance);
                return callback (null, true, ip);
            }
        }
        callback(null, false, ip);
    });
}

exports.detect = detect;
exports.type = ['vbus'];
