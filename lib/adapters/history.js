'use strict';

const tools = require('../tools.js');

function detect(ignore1, ignore2, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['used for historian'] = {
        'en': 'Store historical data in JSON Files in Filesystem',
        'de': 'Historische Daten in JSON-Dateien im Dateisystem speichern',
        'ru': 'используется для хранения истории событий',
        "pt": "Armazenar dados históricos em arquivos JSON no sistema de arquivos",
        "nl": "Sla historische gegevens op in JSON-bestanden in het bestandssysteem",
        "fr": "Stocker des données historiques dans des fichiers JSON dans un système de fichiers",
        "it": "Memorizza i dati storici in file JSON nel filesystem",
        "es": "Almacenar datos históricos en archivos JSON en el sistema de archivos",
        "pl": "Przechowuj dane historyczne w plikach JSON w systemie plików",
        "zh-cn": "将历史数据存储在Filesystem中的JSON文件中"
    };
    tools.words['History adapter'] = {
        'en': 'History adapter',
        'de': 'History Adapter',
        'ru': 'History драйвер',
        "pt": "Adaptador histórico",
        "nl": "Geschiedenis adapter",
        "fr": "Adaptateur d'histoire",
        "it": "Adattatore di storia",
        "es": "Adaptador de historia",
        "pl": "Adapter historii",
        "zh-cn": "历史适配器"
    };

    let instance = tools.findInstance(options, 'history');
    if (!instance) {
        instance = tools.findInstance(options, 'influxdb');
        if (!instance) {
            instance = tools.findInstance(options, 'sql');
            if (!instance) {
                instance = {
                    _id: tools.getNextInstanceID('history', options),
                    common: {
                        name: 'history',
                        title: tools.translate(options.language, 'History adapter')
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
