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

    tools.testPort(ip, 8181, function (err, found, ip, port) {
        if (found) {
            var instance = tools.findInstance(options, 'hm-rega', function (obj) {
                return (obj.native.homematicAddress === ip || obj.native.homematicAddress === device._name) && obj.native.homematicPort === 8181;
            });
            var modified = false;
            var name = ip + ((device._name && device._name !== ip) ? (' - ' + device._name) : '');
            if (!instance) {
                modified = true;
                instance = {
                    _id: tools.getNextInstanceID('hm-rega', options),
                    common: {
                        name: 'hm-rega',
                        title: 'HomeMatic ReGaHSS (' + name + ')'
                    },
                    native: {
                        homematicAddress: ip,
                        homematicPort: 8181
                        /* 
                         rfdEnabled:               true,
                         rfdAdapter:               'hm-rpc.0',
                         hs485denabled:            false,
                         hs485dAdapter:            'hm-rpc.1',
                         cuxdEnabled:              false,
                         cuxdAdapter:              'hm-rpc.2',
                         hmipEnabled:              false,
                         hmipAdapter:              'hm-rpc.3', */
                    }, 
                    comment: {
                        add: [name]
                    }
                }
            }

            // try to find hm-rpc
            var j;
            var instances = options.existingInstances;
            for (j = 0; j < instances.length; j++) {
                if (instances[j].common && instances[j].common.name === 'hm-rpc') {
                    if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'rfd') {
                        if (!instance.native.rfdEnabled && instances[j]._id) {
                            instance.native.rfdEnabled = true;
                            modified = true;
                            instance.comment = instance.comment || {};
                            if (instance.comment.ack) instance.comment.ack = false;
                            if (instance.comment.add) {
                                instance.comment.add.push('Wireless RF');
                            } else {
                                instance.comment.extended = instance.comment.extended || [];
                                instance.comment.extended.push({add: 'Wireless RF'});
                            }
                            instance.native.rfdAdapter = instances[j]._id.substring('system.adapter.'.length);
                        }
                        if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'hs485d') {
                            if (!instance.native.hs485denabled && instances[j]._id) {
                                instance.native.hs485denabled = true;
                                modified = true;
                                instance.comment = instance.comment || {};
                                if (instance.comment.ack) instance.comment.ack = false;
                                if (instance.comment.add) {
                                    instance.comment.add.push('HS485d');
                                } else {
                                    instance.comment.extended = instance.comment.extended || [];
                                    instance.comment.extended.push({add: 'HS485d'});
                                }
                                instance.native.hs485dAdapter = instances[j]._id.substring('system.adapter.'.length);
                            }
                        }
                        if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'CUxD') {
                            if (!instance.native.cuxdEnabled && instances[j]._id) {
                                instance.native.cuxdEnabled = true;
                                instance.comment = instance.comment || {};
                                if (instance.comment.ack) instance.comment.ack = false;
                                if (instance.comment.add) {
                                    instance.comment.add.push('CUxD');
                                } else {
                                    instance.comment.extended = instance.comment.extended || [];
                                    instance.comment.extended.push({add: 'CUxD'});
                                }
                                modified = true;
                                instance.native.cuxdAdapter = instances[j]._id.substring('system.adapter.'.length);
                            }
                        }
                        if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'HMIP') {
                            if (!instance.native.hmipEnabled && instances[j]._id) {
                                instance.comment = instance.comment || {};
                                if (instance.comment.ack) instance.comment.ack = false;
                                if (instance.comment.add) {
                                    instance.comment.add.push('HMIP');
                                } else {
                                    instance.comment.extended = instance.comment.extended || [];
                                    instance.comment.extended.push({add: 'HMIP'});
                                }
                                instance.native.hmipEnabled = true;
                                modified = true;
                                instance.native.hmipAdapter = instances[j]._id.substring('system.adapter.'.length);
                            }
                        }
                    }
                }
            }
            
            instances = options.newInstances;
            for (j = 0; j < instances.length; j++) {
                if (instances[j].common && instances[j].common.name === 'hm-rpc') {
                    if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'rfd') {
                        if (!instance.native.rfdEnabled && instances[j]._id) {
                            instance.native.rfdEnabled = true;
                            modified = true;
                            instance.comment = instance.comment || {};
                            if (instance.comment.ack) instance.comment.ack = false;
                            if (instance.comment.add) {
                                instance.comment.add.push('Wireless RF');
                            } else {
                                instance.comment.extended = instance.comment.extended || [];
                                instance.comment.extended.push({add: 'Wireless RF'});
                            }
                            instance.native.rfdAdapter = instances[j]._id.substring('system.adapter.'.length);
                        }
                    }
                    if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'hs485d') {
                        if (!instance.native.hs485denabled && instances[j]._id) {
                            instance.native.hs485denabled = true;
                            modified = true;
                            instance.comment = instance.comment || {};
                            if (instance.comment.ack) instance.comment.ack = false;
                            if (instance.comment.add) {
                                instance.comment.add.push('HS485d');
                            } else {
                                instance.comment.extended = instance.comment.extended || [];
                                instance.comment.extended.push({add: 'HS485d'});
                            }
                            instance.native.hs485dAdapter = instances[j]._id.substring('system.adapter.'.length);
                        }
                    }
                    if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'CUxD') {
                        if (!instance.native.cuxdEnabled && instances[j]._id) {
                            instance.native.cuxdEnabled = true;
                            modified = true;
                            instance.comment = instance.comment || {};
                            if (instance.comment.ack) instance.comment.ack = false;
                            if (instance.comment.add) {
                                instance.comment.add.push('CUxD');
                            } else {
                                instance.comment.extended = instance.comment.extended || [];
                                instance.comment.extended.push({add: 'CUxD'});
                            }
                            instance.native.cuxdAdapter = instances[j]._id.substring('system.adapter.'.length);
                        }
                    }
                    if (instances[j].native.homematicAddress === ip && instances[j].native.daemon === 'HMIP') {
                        if (!instance.native.hmipEnabled && instances[j]._id) {
                            instance.native.hmipEnabled = true;
                            instance.comment = instance.comment || {};
                            if (instance.comment.ack) instance.comment.ack = false;
                            if (instance.comment.add) {
                                instance.comment.add.push('HMIP');
                            } else {
                                instance.comment.extended = instance.comment.extended || [];
                                instance.comment.extended.push({add: 'HMIP'});
                            }
                            modified = true;
                            instance.native.hmipAdapter = instances[j]._id.substring('system.adapter.'.length);
                        }
                    }
                }
            }

            // if no one hm-rpc found => ignore it
            if (!instance.native.hs485dAdapter && !instance.native.hmipAdapter && !instance.native.rfdAdapter && !instance.native.cuxdAdapter) {
                modified = false;
            }

            if (modified) {
                options.newInstances.push(instance);
            }
            callback(null, modified, ip);
        } else {
            callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks
exports.dependencies = ['hm-rpc'];
exports.timeout = 1500;