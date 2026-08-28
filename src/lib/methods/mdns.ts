import type { DiscoveryDevice, MethodInstance, ProtocolData } from '../types';

let Mdns;
let dns;

const methodName = 'mdns';

export function browse(this: MethodInstance, self: MethodInstance): void {
    try {
        Mdns ||= require('mdns-discovery');
        dns ||= require('node:dns');
    } catch {
        // Known bug: the condition is inverted, so the warning is only attempted when
        // `self` is not an object - and then `self.log` would throw. Kept as is, to be
        // fixed separately.
        if (typeof self !== 'object') {
            (self as MethodInstance).log.warn('skipping mdns method, because no binary package...');
        }
        setTimeout(self.done.bind(self, 'binary package not installed'));
        return;
    }

    this.close = (): void => {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the handler only runs after the declaration below
        mdns.close();
        self.done();
    };

    const mdns = new Mdns({
        timeout: parseInt(self.timeout as unknown as string, 10) / 1000 || 10,
        name: [
            '_services._dns-sd._udp.local',
            '_raop._tcp.local',
            '_sleep-proxy.-udp',
            '_homekit._tcp',
            '_amzn-wplay._tcp.local',
            '_http._tcp.local',
            '_mieleathome._tcp',
            '_services._dns-sd._udp.local',
            '_touch-able._udp',
            '_coap._udp.local', // used to discover tradfri devices
            '_dhnap._tcp.local', // used to discover mydlink devices
            'venus.local', // For Victron devices
            // Service types below were read out of the respective adapter's own discovery code
            '_shelly._tcp.local', // Shelly generation 2 and newer; generation 1 answers on _http._tcp
            '_elg._tcp.local', // Elgato Key Light
            '_hwenergy._tcp.local', // HomeWizard Energy
            '_homewizard._tcp.local', // HomeWizard, older firmware
            '_zapp._tcp.local', // Feller zeptrion / zApp
            '_samsungmsf._tcp.local', // Samsung TV, multiscreen framework
            '_samsungtv._tcp.local',
            '_esphomelib._tcp.local', // ESPHome, from @2colors/esphome-native-api
            '_matterc._udp.local', // Matter node waiting to be commissioned
            '_matter._tcp.local', // Matter node already in a fabric
        ],
        find: '*',
        broadcast: false,
    });

    mdns.noQuestions = true;
    self.setTimeout(self.timeout, { timeout: false });

    this.log.info('Discovering mDNS devices...');
    mdns.on('entry', (entry: ProtocolData): void => {
        const device: DiscoveryDevice = {
            //_data: {address: entry.ip}, // is it used?
            _addr: entry.ip,
            _name: entry.name,
            _mdns: {},
        };
        Object.keys(entry).forEach(n => (device._mdns[n] = entry[n]));

        //self.log.debug('Discovered mDNS device: ' + JSON.stringify(device));
        if (self.addDevice(device) === 'halt') {
            self.done();
        }
    });
    mdns.run((/* result */): void => self.done());
}

export const foundCount = 0; // if needed, do only read
export const progress = 0;
// end
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const type = 'mdns';
//exports.subType = 'mdns';
export const source = methodName;
export const timeout = 15000;

export const options = {};

// exports.options = {
//     mdnsTimeout: {
//         min: 15000,
//         max: 60000,
//         type: 'number'
//     }
// };
