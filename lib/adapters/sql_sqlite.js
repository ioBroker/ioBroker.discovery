'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for historian'] = {
        'en': 'Store historical data in an SQLite File Database',
        'de': 'Historische Daten in einer SQLite Datei-Datenbank speichern',
        'ru': 'используется для хранения истории событий'
    };
    tools.words['SQlite adapter'] = {
        'en': 'SQlite adapter',
        'de': 'SQlite Adapter',
        'ru': 'SQlite драйвер'
    };

    let instance = tools.findInstance(options, 'sql', obj => obj.native.dbtype !== 'sqlite');
    if (!instance) {
        instance = tools.findInstance(options, 'influxdb');
        if (!instance) {
            instance = tools.findInstance(options, 'history');
            if (!instance) {
                instance = tools.findInstance(options, 'sql', obj => obj.native.dbtype === 'sqlite');
                if (!instance) {
                    instance = {
                        _id: tools.getNextInstanceID('sql', options),
                        common: {
                            name: 'sql',
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
    }
    callback(null, false);
}

exports.detect = detect;
exports.type = 'advice';// make type=serial for USB sticks
