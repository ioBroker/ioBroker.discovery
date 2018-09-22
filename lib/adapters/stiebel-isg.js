const tools = require('../tools.js');
const http = require('http');

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


    // print error function
    function printError(error) {
        //options.log.error(error.message);
        callback(null, false, ip);
    }

    function isStiebelISG() {
        const request = http.get('http://' + ip, response => {
            let body = '';

            response.on('data', chunk => body += chunk);

            response.on('end', () => {
                if (response.statusCode === 200) {
                    try {
                        if (body && body.indexOf('alt="Servicewelt"') !== -1) {
                            let instance = tools.findInstance(options, 'stiebel-isg', obj => obj.native.isgAddress === ip);

                            if (!instance) {
                                instance = {
                                    _id: tools.getNextInstanceID('stiebel-isg', options),
                                    common: {
                                        name: 'stiebel-isg',
                                        title: 'stiebel-isg (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                                    },
                                    native: {
                                        isgAddress: ip
                                    },
                                    comment: {
                                        add: ['stiebel-isg (' + ip + ')']
                                    }
                                };
                                options.newInstances.push(instance);
                                callback(null, true, ip);
                            } else {
                                printError();
                            }
                        } else {
                            printError();
                        }
                    } catch (error) {
                        printError(error);
                    }
                } else {
                    printError();
                }
            });
        });

        // Connection Error
        request.on('error', printError);
    }

    isStiebelISG();
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
