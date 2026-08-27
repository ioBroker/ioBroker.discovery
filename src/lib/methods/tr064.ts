import type { DetectCallback, DiscoveryInstance, MethodInstance, ProtocolData } from '../types';

let adapter: any;

if (module?.parent?.exports?.adapter) {
    adapter = module.parent.exports.adapter;
}

function getVersionAsNumber(version: string): number {
    if (typeof version !== 'string') {
        return version;
    }
    let val = 0;
    const ar = version.split('.');

    ar?.forEach(v => (val = val * 1000 + ~~v));

    return val;
}

function tr064Running(callback: DetectCallback): void {
    callback ||= function (): void {};

    adapter.getForeignState('system.adapter.tr-064.0.alive', (err: unknown, state: ioBroker.State | null): void => {
        if (err || !state) {
            return callback('tr-064.0 not installed');
        }

        if (!state.val) {
            return callback('tr-064.0 installed, but not running');
        }

        adapter.getForeignObject('system.adapter.tr-064.0', (err: unknown, obj: DiscoveryInstance): void => {
            if (err || !obj) {
                return callback('Can not get tr-064 system object');
            }
            if (getVersionAsNumber(obj.common.installedVersion) < getVersionAsNumber('0.1.16')) {
                const _err = 'Version of installed tr.064 adapter is to low. Please update...';
                adapter.log.error(_err);
                return callback(_err);
            }
            callback(0, true);
        });
    });
}

function discoverTr064(self: MethodInstance): void {
    if (adapter === undefined && self.adapter) {
        adapter = self.adapter;
    }
    self.timeout = 5000;
    self.setTimeout(self.timeout);

    tr064Running((err /* , running */): void => {
        if (err) {
            return self.done(err);
        }
        adapter.sendTo('tr-064.0', 'discovery', { onlyActive: true }, (result: ProtocolData): void => {
            if (!result) {
                return self.done('no result');
            }

            let fbDevices;

            try {
                fbDevices = JSON.parse(result);
            } catch {
                return self.done('JSON.parse exception');
            }

            if (fbDevices) {
                fbDevices.forEach((device: ProtocolData): void => {
                    //console.log(JSON.stringify(device));
                    device = {
                        _addr: device.ip,
                        _name: device.name,
                        _tr064: {
                            mac: device.mac,
                            addr: device.ip,
                            name: device.name,
                        },
                    };
                    self.addDevice(device);
                });
            }

            // stop the ping loop;
            if (self.adapter.config.stopPingOnTR064Ready && typeof self.halt === 'object') {
                self.halt.ping = true;
            }
            self.done();
        });
    });
}

export const browse = discoverTr064;
export const type = 'ip';
export const source = 'tr064'; //methodName;
export const options = {};
