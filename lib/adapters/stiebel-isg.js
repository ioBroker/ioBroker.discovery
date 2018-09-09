const tools = require('../tools.js');

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
    var http = require('http');

    // print error function
    function printError(error){
        //options.log.error(error.message);
        callback(null, false, ip);
    }

    function isStiebelISG(){
        var request = http.get('http://' + ip, function(response){

            var body = "";

            response.on("data", function(chunk){
                body += chunk;
            });

            response.on("end", function(){
                if(response.statusCode === 200){
                try{
                if (body && body.indexOf('alt="Servicewelt"') !== -1) {
                    var instance = tools.findInstance(options, 'stiebel-isg', function (obj) {
                        return (obj.native.isgAddress === ip);
                    });
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
                        callback(null, false, ip);
                    }
                } else {
                    printError(error);
                }
            }
            catch(error){
                printError(error);
            }
        }
        else{
            printError;
        }
            });
        });

        // Connection Error
        request.on("error", printError);
    }

    isStiebelISG();
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
