import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice, ProtocolData } from '../types';

function addInstance(ip: string, device: DiscoveryDevice, options: DetectOptions): boolean {
    let instance = tools.findInstance(options, 'samsung', obj => obj.native.ip === ip);

    if (!instance) {
        const id = tools.getNextInstanceID('samsung', options);
        instance = {
            _id: id,
            common: {
                name: 'samsung',
            },
            native: {
                useSSDP: true, //??
            },
            comment: {
                add: [/*meta.modelDescription, meta.modelName,*/ ip],
            },
        };
        options.newInstances.push(instance);
        return true;
    }
    return false;
}

/*
function createXmlRegex(names, reTest) {
    if (!Array.isArray(names)) {
        names = names.split(',');
    }
    let re = '^<\\?xml';
    for (let i = 0; i < names.length; i++) {
        re += `[\\s\\S]*?<${names[i]}>(.*?)</${names[i]}>`;
    }
    re += '.*';

    const regexp = new RegExp(re, 'g');

    return function (str) {
        if (!str) {
            return false;
        }
        if (reTest && !reTest.test(str)) {
            return false;
        }

        const ar = regexp.exec(str);
        if (!ar || ar.length < names.length + 1) {
            return false;
        }

        const o = {};
        for (let i = 0; i < names.length; i++) {
            o[names[i]] = ar[i + 1] || '';
        }
        return o;
    };
}
*/
// const rexTest = /^<\?xml[\s\S]*?<modelDescription>Samsung TV.*?<\/modelDescription>/g;
// const rexSamsung = createXmlRegex('manufacturer,modelDescription,modelName');

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    let foundInstance = false;

    device._upnp.forEach((upnp: ProtocolData): void => {
        if (!foundInstance && upnp._location?.includes('Samsung TV.')) {
            //let meta = rexSamsung(upnp._location, rexTest);
            //if (meta)
            if (addInstance(ip, device, options /*, meta*/)) {
                foundInstance = true;
            }
        }
    });

    callback(null, foundInstance, ip);
}

export const type = ['upnp']; // TODO check if upnp and location call
