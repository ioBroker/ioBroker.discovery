import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

function addDevice(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback | null): void {
    let instance = tools.findInstance(
        options,
        'landroid',
        obj => obj.native.ip === ip || obj.native.ip === device._name,
    );

    if (!instance) {
        tools.words.pinCode = {
            de: 'Vierstellige PIN des Rasenmähers eingeben',
            en: 'Four-digit PIN of lawn mower',
            ru: 'Четыре-значный PIN-код газонокосилки',
            pt: 'PIN de quatro dígitos do cortador de grama',
            nl: 'Viercijferige pincode van grasmaaier',
            fr: 'NIP à quatre chiffres de la tondeuse à gazon',
            it: 'PIN a quattro cifre della falciatrice',
            es: 'PIN de cuatro dígitos de la cortadora de césped',
            pl: 'Czterocyfrowy kod PIN kosiarki',
            'zh-cn': '割草机的四位数PIN',
        };

        instance = {
            _id: tools.getNextInstanceID('landroid', options),
            common: {
                name: 'landroid',
                title: `Worx Landroid mower adapter (${ip}${device._name ? ` - ${device._name}` : ''})`,
            },
            native: {
                ip: ip,
            },
            comment: {
                add: [ip],
                inputs: [
                    {
                        name: 'native.pin',
                        def: '',
                        type: 'password', // text, checkbox, number, select, password. Select requires
                        title: tools.translate(options.language, 'pinCode'), // see translation in words.js
                    },
                ],
            },
        };
        options.newInstances.push(instance);
        callback?.(null, true, ip);
    } else {
        callback?.(null, false, ip);
    }
}

// just check if IP exists
export function detect(
    ip: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
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

    tools.httpGet(`http://${ip}:80/jsondata.cgi`, (err, data): void => {
        if (err) {
            if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        } else {
            let testData;
            try {
                testData = JSON.parse(data!);
            } catch {
                testData = null;
            }
            if (
                testData &&
                Object.prototype.hasOwnProperty.call(testData, 'percent_programmatore') &&
                Object.prototype.hasOwnProperty.call(testData, 'enab_bordo')
            ) {
                addDevice(ip, device, options, callback);
            } else if (callback) {
                callback(null, false, ip);
                callback = null;
            }
        }
    });
}
export const type = ['ip']; // make type=serial for USB sticks
