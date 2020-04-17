'use strict';

const tools = require('../tools.js');
const https = require('https');

const adapterName = 'bshb';

/**
 * Get root ca certificate of Bosch Smart Home Controller.
 * We can do this or we can trust all.
 */
const ca = '-----BEGIN CERTIFICATE-----\n' +
        'MIIFujCCA6KgAwIBAgIUIbQ+BIVcGVD29UIe+Sv6/+Qy/OUwDQYJKoZIhvcNAQEL\n' +
        'BQAwYzELMAkGA1UEBhMCREUxITAfBgNVBAoMGEJvc2NoIFRoZXJtb3RlY2huaWsg\n' +
        'R21iSDExMC8GA1UEAwwoU21hcnQgSG9tZSBDb250cm9sbGVyIFByb2R1Y3RpdmUg\n' +
        'Um9vdCBDQTAeFw0xNTA4MTgwNzIwMTNaFw0zNTA4MTQwNzIwMTNaMGMxCzAJBgNV\n' +
        'BAYTAkRFMSEwHwYDVQQKDBhCb3NjaCBUaGVybW90ZWNobmlrIEdtYkgxMTAvBgNV\n' +
        'BAMMKFNtYXJ0IEhvbWUgQ29udHJvbGxlciBQcm9kdWN0aXZlIFJvb3QgQ0EwggIi\n' +
        'MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQCcFmt1vu85lfXMl66Ix32tmEbc\n' +
        'n4bt6Oa6QIiT6zJIR2DsE85c42H8XogATWiqfp3FTbmfIIijfoj9JL6uyFkw0yrT\n' +
        'qfttw9KD8DRIV973F1UyAP8wPxpdt2QPJCBMmqymC6h2oT7eS6hRIMbY3SFLa5lO\n' +
        '4EQ10uflZnY9Yv7kTzeuEw1qWqd8kHhfDBq3k2N90oopt47ghDQ/qUmne19xp0jQ\n' +
        'fXFA6hfudNcU9vuZ6hvObm25++ySmRKvtuY+O/CmLVnUJngpKQWJCnYOv3/Z5StZ\n' +
        '5aVvLR028ozc1oqdL8fVeaJX8xIdBsSjB+gOaauEYodJzVfeLdXVb8R4CqVighci\n' +
        'EUuwZVhzdtA5qs2O9jLJv6JFiD+uuRn8Ip1uYiajYqkRzR2egKWFfhZvV6Yk2zuw\n' +
        's8FUtagtYRwKCp+F+f+PCryLcBcnyc7iVm0Xo7kQAjzoDql4vmXQybmP6kU9qzmD\n' +
        'xEG02s6FHVn1X1X4htXc/+Wh0/0850T+Up2HeN+ZN92BubI8yM62mecvfx08vSb1\n' +
        '5AviYkQQE37KzGeKYYbciEMeVu5sLx/lN6YIcyHY5kTUsU7SCzw7vTTsNjTzuzYa\n' +
        'l2fudHS8lOHaAwvZP//14cM+N9beQqLzxS7jdmFQxtToyzdbgL1OekO58fiqti4W\n' +
        'd88bnmMBZsl3bR9b5QIDAQABo2YwZDASBgNVHRMBAf8ECDAGAQH/AgECMB0GA1Ud\n' +
        'DgQWBBThUGsROMNnqMhPn+qFxk8R9VdWPjAfBgNVHSMEGDAWgBThUGsROMNnqMhP\n' +
        'n+qFxk8R9VdWPjAOBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggIBAEp2\n' +
        'bQei/KQGrnsnqugeseDVKNTOFp5o0xYz8gXEWzRCuAIo/sYKcFWziquajJWuCt/9\n' +
        'CexNFWkYtV95EbunyE+wijQcnOehGSZ2gWnZiQU2fu1Y4aA5g3LlB61ljnbhX4SE\n' +
        'tLs31iTdjPFcWMx+rsS3+qfuOiOqQbliTykG+p/ULVLLPDCmzL/MHg3w5AiGB8k5\n' +
        'i1npzDKJKpLFGFWEnECYKhPi93rLfdgmOEFalIoFB96/upm6bfOWbNvsdIspFVGe\n' +
        '3zSjWUvveHe9mm+VTq9aldwy/J0/81oFF7C5CmlB31sDwfY+qF5/mHKfPbrnWTIi\n' +
        'QAiZJxXrbmeWX9JVutRbokP1UTX63ghH+BNab/E1D020JVkimMf2Vg1/5WR2gdkN\n' +
        'S4j+f//uVKuCr7bPGWzcADeURlyCmW/O2CNfln+T/0YFg2lET9PAEDkZ7Js3I/4f\n' +
        '+Dy58LwjdQYI3Z6qKA9h0Cfgy6KOA8Omyw3QmdTAAd0EgABQ/vxNVL3Q4Oh8Eiff\n' +
        'ZVrpFWLgMxeRckHTMqG9SfGBdZQCO7XPz7mb/8Da6prEfw4VKvdh9llvatWeB1V1\n' +
        'vqixwFVuHIWKxIiR8GXZEjIQXBmeuzdgIceYcw12HYHLUifFozaNtjxMcPcIALKz\n' +
        'GrR4oS2tFVZCjwF4vPAt15fsbEx/F/NfaO6SAFz8\n' +
        '-----END CERTIFICATE-----\n';

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function detect(ip, device, options, callback) {
    options.log.debug('bshb detection for: ' + ip);
    const requestOptions = {};
    requestOptions.hostname = ip;
    requestOptions.port = 8446;
    requestOptions.path = '/smarthome/public/information';
    requestOptions.method = 'GET';
    requestOptions.ca = ca;
    requestOptions.checkServerIdentity = host => {
        host = '' + host;

        if (host === ip) {
            return undefined;
        } else {
            throw new Error(`Hostname verification failed. server=${host} expected=${this.host}`);
        }
    };

    https.request(requestOptions, res => {
        let chunks = [];

        res
            .on('data', data => chunks.push(data))
            .on('end', () => {
                let dataString = undefined;
                if (chunks.length > 0) {
                    const data = Buffer.concat(chunks);
                    dataString = data.toString('utf-8');
                }

                if(res.statusCode !== 200) {
                    callback(null, false, ip);
                    return;
                }

                options.log.debug('found bshc for: ' + ip);

                try {
                    let parsedData = undefined;
                    if (dataString) {
                        parsedData = JSON.parse(dataString);
                    }

                    if (parsedData && parsedData.shcIpAddress) {

                        let instance = tools.findInstance(options, adapterName, obj => obj.native.host === ip);
                        if (instance == null || typeof instance === 'undefined') {
                            options.log.debug('No bshb instance found');
                            let identifier = uuidv4();
                            options.log.debug('Generated bshb identifier with:' + identifier);
                            instance = {
                                _id: tools.getNextInstanceID(adapterName, options),
                                common: {
                                    name: adapterName,
                                    title: 'Bosch Smart Home Bridge'
                                },
                                native: {
                                    host: ip,
                                    identifier: identifier
                                },
                                comment: {
                                    add: [ip]
                                }
                            };
                            options.newInstances.push(instance);
                            callback(null, true, ip);
                        }
                    }
                } catch (e) {
                    callback(null, false, ip);
                }

            })
            .on('error', () => {
                callback(null, false, ip);
            });
    })
        .on('error', () => {
            callback(null, false, ip);
        })
        .end();
}

exports.detect = detect;
exports.type = ['ip'];
