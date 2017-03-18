var tools = require(__dirname + '/../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for charts'] = {
        'en': 'used for charts',
        'de': 'wird für die Charts benutzt',
        'ru': 'используется для графиков'
    };
    tools.words['flot adapter'] = {
        'en': 'Flot adapter',
        'de': 'Flot Adapter',
        'ru': 'Flot драйвер'
    };
    
    var instance = tools.findInstance(options, 'history') || tools.findInstance(options, 'sql') || tools.findInstance(options, 'influxdb');
    if (instance) {
        instance = tools.findInstance(options, 'flot');
        if (!instance) {
            // cloud required web instance so check and install it too
            var webInstance = tools.findInstance(options, 'web');

            var id = tools.getNextInstanceID('flot', options);

            if (!webInstance) {
                webInstance = {
                    _id: tools.getNextInstanceID('web', options),
                    common: {
                        name: 'web',
                        title: 'ioBroker web Adapter'
                    },
                    native: {
                    },
                    comment: {
                        add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))]
                    }
                };
                options.newInstances.push(webInstance);
            }

            instance = {
                _id: tools.getNextInstanceID('flot', options),
                common: {
                    name: 'flot',
                    title: tools.translate(options.language, 'flot adapter')
                },
                native: {
                },
                comment: {
                    add: [tools.translate(options.language, 'used for charts')],
                    required: [webInstance._id],
                    advice: true
                }
            };
            options.newInstances.push(instance);
            callback(null, true, instance._id.substring('system.adapter.'.length));
            return;
        }
    } 
    callback(null, false);
}

exports.detect = detect;
exports.type = 'advice';// make type=serial for USB sticks