var tools = require(__dirname + '/../tools.js');

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
        //options.log.debug(error.message);
        callback(null, false, ip);
    }

    function isEnergymanager(){
        var request = http.get('http://' + ip + '/rest/kiwigrid/wizard/devices', function(response){

            var body = "";

            response.on("data", function(chunk){
                body += chunk;
            });

            response.on("end", function(){
                if(response.statusCode === 200){
                try{
                if (body && body.indexOf('kiwigrid') !== -1) {
                //var managerData = JSON.parse(body);
                //if (managerData.hasOwnProperty("result")){
                    var instance = tools.findInstance(options, 'energymanager', function (obj) {
                        return (obj.native.managerAddress === ip);
                    });
                    if (!instance) {
                        instance = {
                            _id: tools.getNextInstanceID('energymanager', options),
                            common: {
                                name: 'energymanager',
                                title: 'energymanager (' + ip + (device._name ? (' - ' + device._name) : '') + ')'
                            },
                            native: {
                                managerAddress: ip
                            },
                            comment: {
                                add: ['energymanager (' + ip + ')']
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

    isEnergymanager();
}

exports.detect = detect;
exports.type = ['ip'];// make type=serial for USB sticks
