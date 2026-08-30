import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';
const adapterName = 'tradfri';

const hostnameRegExp = /^gw-[a-f0-9]{12}/;
/**
 * Check if a hostname references a tradfri gateway
 *
 * @param hostname The hostname to check
 */
function hostnameIsTradfri(hostname: string): boolean {
    return hostnameRegExp.test(hostname);
}

function startsWithTRADFRI(str: string): boolean {
    return /^TRADFRI/.test(str);
}

/**
 * Tests if a packet references a CoAP resource
 *
 * @param packetName The name of the packet to check
 */
function isCoAP(packetName: string): boolean {
    return /_coap\._udp\.local$/.test(packetName);
}

function addInstance(
    ip: string,
    hostname: string,
    device: DiscoveryDevice,
    options: DetectOptions,
    callback: DetectCallback | null,
): void {
    // Try to find an existing instance for this IP
    const instance = tools.findInstance(
        options,
        adapterName,
        obj => obj?.native && (obj.native.host === ip || obj.native.host === hostname),
    );

    if (!instance) {
        const id = tools.getNextInstanceID(adapterName, options);
        options.newInstances.push({
            _id: id,
            common: {
                name: adapterName,
            },
            native: {
                host: ip,
            },
            comment: {
                add: [tools.translate(options.language, 'Required for %s', `Trådfri gateway ${hostname}`)],
            },
        });
        callback?.(true);
    } else {
        callback?.(false);
    }
}

function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback | null): void {
    function fail(): void {
        callback?.(null, false, ip);
        callback = null;
    }

    // console.log("tradfri => device=" + JSON.stringify(device));

    // We need to have mdns data with a PTR and SRV record, both referencing a CoAP resource
    if (
        !device._mdns ||
        !(device._mdns.PTR && isCoAP(device._mdns.PTR.name)) ||
        !(device._mdns.SRV && isCoAP(device._mdns.SRV.name))
    ) {
        return fail();
    }

    // The PTR must point to a tradfri gateway with a corresponding SRV entry
    const fullHostname = device._mdns.PTR.data;
    const srv = device._mdns.SRV;
    if (srv.name !== fullHostname || !hostnameIsTradfri(fullHostname)) {
        return fail();
    }

    // The SRV must have a port of 5684
    if (parseInt(srv.data.port, 10) !== 5684) {
        return fail();
    } // != because we don't know if string or number

    // And the A(AAA) record must contain "TRADFRI"
    const ARecord = device._mdns.A || device._mdns.AAAA;
    if (!startsWithTRADFRI(ARecord.name)) {
        return fail();
    }

    const shortHostname = hostnameRegExp.exec(fullHostname)![0];
    addInstance(ip, shortHostname, device, options, callback);
}

export { detect };
export const type = ['mdns'];
export const timeout = 1500;
