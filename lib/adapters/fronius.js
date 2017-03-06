var tools = require(__dirname + '/../tools.js');

function addDevice(ip, device, options, native, callback) {
    var instance = tools.findInstance(options, 'fronius', function (obj) {
        return obj.native.ip === ip;
    });
    if (!instance) {
        instance = {
            _id: tools.getNextInstanceID('fronius', options),
            common: {
                name: 'fronius',
                title: 'Fronius inverters adapter (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
            },
            native: native,
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        callback(null, false, ip);
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
    tools.httpGet('http://' + ip + '/solar_api/GetAPIVersion.cgi', function (err, data) {
        if (err) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            // Get BaseURL
            var testData
            try {
                testData = JSON.parse(data);
            } catch (e) {
                testData = {};
            }
            if (testData.hasOwnProperty('BaseURL')) {
                var baseUrl = testData.BaseURL;
                var apiVersion = testData.APIVersion;

                if (apiVersion === 1) {
                    tools.httpGet('http://' + ip + baseUrl + 'GetActiveDeviceInfo.cgi?DeviceClass=System', function (err, data) {
                        if (err) {
                            if (callback) {
                                callback(null, false, ip);
                                callback = null;
                            }
                        } else {
                            var result;
                            try {
                                result = JSON.parse(data).Body.Data;
                            } catch (e) {
                                if (callback) {
                                    callback(null, false, ip);
                                    callback = null;
                                }
                                return;
                            }

                            var native = {
                                ip: ip,
                                apiversion: 1,
                                baseurl: baseUrl,
                                inverter: result.hasOwnProperty('Inverter')?Object.keys(result.Inverter):'',
                                sensorCard: result.hasOwnProperty('SensorCard')?Object.keys(result.SensorCard):'',
                                stringControl: result.hasOwnProperty('StringControl')?Object.keys(result.StringControl):'',
                                meter: result.hasOwnProperty('Meter')?Object.keys(result.Meter):'',
                                storage: result.hasOwnProperty('Storage')?Object.keys(result.Storage):''
                                // poll will be added automatically from io-package.json
                            };
                            addDevice(ip, device, options, native, callback);
                        }
                    });
                } else if (apiVersion === 0) {
                    tools.httpGet('http://' + ip + baseUrl + 'GetActiveDeviceInfo.cgi?DeviceClass=Inverter', function (err, inverter) {
                        if (err) {
                            if (callback) {
                                callback(null, false, ip);
                                callback = null;
                            }
                        } else {
                            tools.httpGet('http://' + ip + baseUrl + 'GetActiveDeviceInfo.cgi?DeviceClass=SensorCard', function (err, sensor) {
                                if (err) {
                                    if (callback) {
                                        callback(null, false, ip);
                                        callback = null;
                                    }
                                } else {
                                    tools.httpGet('http://' + ip + baseUrl + 'GetActiveDeviceInfo.cgi?DeviceClass=StringControl', function (err, strings) {
                                        if (err) {
                                            if (callback) {
                                                callback(null, false, ip);
                                                callback = null;
                                            }
                                        } else {
                                            try {
                                                inverter = JSON.parse(inverter);
                                                sensor = JSON.parse(sensor);
                                                strings = JSON.parse(strings);
                                            } catch (e) {
                                                if (callback) {
                                                    callback(null, false, ip);
                                                    callback = null;
                                                }
                                                return;
                                            }
                                            var native = {
                                                ip: ip,
                                                apiversion: 0,
                                                baseurl: baseUrl,
                                                inverter: Object.keys(inverter.Body.Data.Inverter),
                                                sensorCard: Object.keys(sensor.Body.Data.SensorCard),
                                                stringControl: Object.keys(strings.Body.Data.StringControl)
                                                // poll will be added automatically from io-package.json
                                            };

                                            addDevice(ip, device, options, native, callback);
                                        }
                                    });
                                }
                            });
                        }
                    });
                } else if (callback) {
                    options.log.warn('Unknown api version for "' + ip + '": ' + apiVersion);
                    callback(null, false, ip);
                    callback = null;
                }
            } else if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        }
    });
}
exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks