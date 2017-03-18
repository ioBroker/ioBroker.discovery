var tools = require(__dirname + '/../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for historian'] = {
        'en': 'used for historian',
        'de': 'wird für die Speicherung von historischen Daten benutzt',
        'ru': 'используется для хранения истории событий'
    };
    tools.words['SQlite adapter'] = {
        'en': 'SQlite adapter',
        'de': 'SQlite Adapter',
        'ru': 'SQlite драйвер'
    };
    
    var instance = tools.findInstance(options, 'sql', function (obj) {
        return obj.native.dbtype !== 'sqlite';
    });
    if (!instance) {
        instance = tools.findInstance(options, 'history');
        if (!instance) {
            instance = tools.findInstance(options, 'sql', function (obj) {
                return obj.native.dbtype === 'sqlite';
            });
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('sqlite', options),
                    common: {
                        name: 'sqlite',
                        title: tools.translate(options.language, 'SQlite adapter')
                    },
                    native: {
                        dbtype: 'sqlite'
                    },
                    comment: {
                        add: [tools.translate(options.language, 'used for historian')],
                        advice: true
                    }
                };
                options.newInstances.push(instance);
                callback(null, true, instance._id.substring('system.adapter.'.length));
                return;
            }
        }
    } 
    callback(null, false);
}

exports.detect = detect;
exports.type = 'advice';// make type=serial for USB sticks