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
        'ru': 'используется для хранения истории событий',
        "pt": "Armazenar dados históricos em um banco de dados de arquivos SQLite",
        "nl": "Sla historische gegevens op in een SQLite-bestandsdatabase",
        "fr": "Stocker des données historiques dans une base de données de fichiers SQLite",
        "it": "Memorizza i dati storici in un database di file SQLite",
        "es": "Almacenar datos históricos en una base de datos de archivos SQLite",
        "pl": "Przechowuj dane historyczne w bazie danych SQLite",
        "zh-cn": "将历史数据存储在SQLite文件数据库中"
    };
    tools.words['SQlite adapter'] = {
        'en': 'SQlite adapter',
        'de': 'SQlite Adapter',
        'ru': 'SQlite драйвер',
        "pt": "Adaptador SQlite",
        "nl": "SQlite-adapter",
        "fr": "Adaptateur SQlite",
        "it": "Adattatore SQlite",
        "es": "Adaptador SQlite",
        "pl": "Adapter SQlite",
        "zh-cn": "SQlite适配器"
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
