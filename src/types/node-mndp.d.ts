/**
 * Minimal typing for `node-mndp` (MikroTik Neighbor Discovery Protocol) - the package
 * ships no types. Only what `lib/adapters/mikrotik.ts` uses is declared.
 */
declare module 'node-mndp' {
    interface MndpOptions {
        port?: number;
    }

    /** One neighbour as announced by a MikroTik device */
    interface MndpDevice {
        identity?: string;
        version?: string;
        ipAddress?: string;
        macAddress?: string;
        [key: string]: any;
    }

    export class NodeMndp {
        constructor(options?: MndpOptions);
        on(event: 'deviceFound', listener: (device: MndpDevice) => void): this;
        on(event: 'error', listener: (error: Error) => void): this;
        start(): void;
        stop(): void;
    }
}
