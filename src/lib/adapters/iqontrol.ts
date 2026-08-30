import * as tools from '../tools';
import type { DetectCallback, DetectOptions } from '../types';

export function detect(ignore1: unknown, ignore2: unknown, options: DetectOptions, callback: DetectCallback): void {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.language - system language
    tools.words['Fast Web-App for Visualization'] = {
        en: 'Fast Web-App for Visualization',
        de: 'Schnelle Web-App zur Visualisierung',
        ru: 'Быстрое веб-приложение для визуализации',
        pt: 'Fast Web-App para visualização',
        nl: 'Snelle web-app voor visualisatie',
        fr: 'Web-App rapide pour la visualisation',
        it: 'App Web veloce per visualizzazione',
        es: 'Rápida aplicación web para visualización',
        pl: 'Szybka aplikacja internetowa do wizualizacji',
        uk: 'Швидке веб-додаток для візуалізації',
        'zh-cn': '用于可视化的快速Web应用程序',
    };

    let instance = tools.findInstance(options, 'iqontrol');
    if (!instance) {
        // iqontrol requires a web instance so check and install it too
        let webInstance = tools.findInstance(options, 'web', obj => obj?.native);

        const id = tools.getNextInstanceID('iqontrol', options);

        if (!webInstance) {
            webInstance = {
                _id: tools.getNextInstanceID('web', options),
                common: {
                    name: 'web',
                    title: 'ioBroker web Adapter',
                },
                native: {},
                comment: {
                    add: [tools.translate(options.language, 'Required for %s', id.substring('system.adapter.'.length))],
                },
            };
            options.newInstances.push(webInstance);
        }

        instance = {
            _id: id,
            common: {
                name: 'iqontrol',
                title: 'iQontrol Vis',
            },
            native: {
                instance: webInstance._id,
            },
            comment: {
                add: [tools.translate(options.language, 'Fast Web-App for Visualization')],
                advice: true,
                required: [webInstance._id],
            },
        };

        options.newInstances.push(instance);
        callback(null, true, instance._id.substring('system.adapter.'.length));
    } else {
        callback(null, false);
    }
}

export const type = 'advice'; // make type=serial for USB sticks
export const timeout = 100;
