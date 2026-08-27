import type { MethodInstance } from '../types';

function discover(self: MethodInstance): void {
    self.setTimeout(self.timeout);

    self.addDevice({
        //_data: rinfo,
        _addr: '255.255.255.255',
        _name: '',
    });
}

export const browse = discover;
export const type = 'udp';
export const source = 'udp';
export const timeout = 5000;
