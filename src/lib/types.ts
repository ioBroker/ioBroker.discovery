/**
 * Types shared by the discovery core (`main.ts`), the discovery methods
 * (`lib/methods/*.ts`) and the detection modules (`lib/adapters/*.ts`).
 */

/**
 * Payload of a foreign protocol: an mDNS entry, a UPnP/SSDP header set, a TR-064
 * description, ...
 *
 * These structures have no stable schema - every vendor puts different keys in them, and
 * a detection module digs into exactly the keys its own device is known to send. Typing
 * them as `unknown` would force a type assertion in every one of the ~100 detection
 * modules without buying any safety, so the payload stays loosely typed on purpose.
 */
export type ProtocolData = any;

/** Logger handed to the detection modules - a thin facade over `adapter.log` */
export interface DiscoveryLogger {
    debug: (text: string) => void;
    info: (text: string) => void;
    warn: (text: string) => void;
    error: (text: string) => void;
}

/**
 * One device found by a discovery method.
 *
 * Everything prefixed with `_` is written by the discovery core, the rest is whatever the
 * protocol delivered (see {@link ProtocolData}).
 */
export interface DiscoveryDevice {
    /** IP address, serial port name (`COM3`, `/dev/ttyUSB0`) or `0.0.0.0` for the `once` device */
    _addr: string;
    /** Host name, filled in from reverse DNS if the method did not deliver one */
    _name?: string;
    /** Device type the detection modules are matched against: `ip`, `upnp`, `mdns`, `serial`, ... */
    _type?: string;
    /** Name of the method that found the device */
    _source?: string;
    /** Set while the device is being merged into the global list, deleted afterwards */
    _new?: boolean;
    /**
     * UPnP descriptions. A single header map while one method contributed, an array of them
     * afterwards - which is why this is a {@link ProtocolData} and not a fixed shape.
     */
    _upnp?: ProtocolData;
    /** Raw mDNS entry, keyed by record type (`PTR`, `TXT`, `A`, ...) */
    _mdns?: ProtocolData;
    /** Result of the reverse DNS lookup */
    _dns?: { hostnames?: string[] | null };
    /** Cached body of the UPnP `LOCATION` document, filled by `tools.getLocationDesc()` */
    _locationDesc?: string;
    w_locationDesc?: string;
    [key: string]: any;
}

/** Devices collected during a scan, grouped by device type */
export type DiscoveredDevices = Record<string, Record<string, DiscoveryDevice>>;

/**
 * Free-text hint shown next to a proposed instance in the admin UI.
 *
 * `add` / `changed` / `extended` list the devices this instance would cover, `inputs` asks
 * the user for values the detection could not find out by itself.
 */
export interface InstanceComment {
    /**
     * Devices this proposal would cover. A list in almost every module, but the admin UI
     * renders a bare string or number just as well and a few modules make use of that -
     * which is why these three are not pinned down to an array.
     */
    add?: any;
    changed?: any;
    extended?: any;
    text?: string;
    /** Marks a proposal the user should look at even though no device was found */
    advice?: boolean;
    /** Instance ids this proposal depends on, e.g. the `web` instance a cloud instance needs */
    required?: string[];
    /** Non-MIT license the user has to accept before the instance is created */
    license?: string;
    /** Values the detection could not find out - the admin UI asks the user for them */
    inputs?: ProtocolData[];
    /** Set by the core when the very same proposal was already acknowledged by the user */
    ack?: boolean;
    [key: string]: any;
}

/** An instance object a detection module proposes (or an existing one it extends) */
export interface DiscoveryInstance {
    _id: string;
    common: {
        name: string;
        /**
         * Usually the text shown in the admin UI. A few modules (mikrotik, kodi, onkyo, mpd,
         * synology, mclighting) put a `obj => obj.common.title` function here instead, which
         * the admin UI never calls - hence the loose type.
         */
        title?: any;
        titleLang?: ioBroker.StringOrTranslated;
        enabled?: boolean;
        [key: string]: any;
    };
    native: ProtocolData;
    comment?: InstanceComment;
    /** `native` keys the core has to encrypt before storing the proposal */
    encryptedNativeLegacy?: string[];
    /** Set by `tools.findInstance()` when the returned object is a copy of an existing instance */
    _existing?: boolean;
    [key: string]: any;
}

/** Second argument of `tools.findInstance()` - decides whether an instance is a match */
export type InstanceFilter = (instance: DiscoveryInstance) => unknown;

/**
 * State handed to every detection module.
 *
 * A module only ever appends to `newInstances`; `existingInstances` and `enums` are read
 * only and shared by all modules of one scan.
 */
export interface DetectOptions {
    /** Proposals collected so far - this is what a detection module adds to */
    newInstances: DiscoveryInstance[];
    /** Instances that are already configured on this host */
    existingInstances: DiscoveryInstance[];
    /** All `enum.*` objects, used to place new devices into rooms/functions */
    enums: Record<string, ioBroker.EnumObject> | null;
    /** Language of the admin UI, for translated titles and comments */
    language: ioBroker.Languages;
    log: DiscoveryLogger;
    /** Every device of this scan - lets a module correlate several addresses */
    _devices?: DiscoveryDevice[];
    /** The same devices grouped by type */
    _g_devices?: DiscoveredDevices;
    [key: string]: any;
}

/**
 * Result callback of a detection module.
 *
 * `isFound` is `true` only if the module actually added or extended an instance - a
 * recognised but already configured device reports `false`.
 */
export type DetectCallback = (
    error: unknown,
    isFound?: boolean,
    addressOrName?: string | null,
    ...rest: unknown[]
) => void;

/** The contract every module in `lib/adapters/` fulfills */
export interface DetectionModule {
    detect: (
        addr: string | null,
        device: DiscoveryDevice | null,
        options: DetectOptions,
        callback: DetectCallback,
    ) => void;
    /** Device type(s) this module wants to see - `advice` modules run once at the end */
    type: string | string[];
    /** Budget for one `detect()` call in ms, default 2000 */
    timeout?: number;
    /** `true` => run only after every dependency-free module is done */
    dependencies?: boolean;
    /** Development aid: re-`require()` the module on every scan */
    reloadModule?: boolean;
    [key: string]: any;
}

/** How long a method may run and whether its progress should be animated */
export interface MethodTimeoutOptions {
    /** `false` => do not stop the method when the time is up */
    timeout?: boolean;
    /** `false` => do not tick the progress bar */
    progress?: boolean;
}

/**
 * The wrapper a discovery method is called with.
 *
 * `Method` in `main.ts` copies every export of the module onto the wrapper first and then
 * adds the API below, so a method sees its own exports (`source`, `type`, `timeout`, and
 * whatever else it exports) next to these members.
 */
export interface MethodInstance {
    /** Name of the method, used as the `_source` of every device it reports */
    source: string;
    /** Device type the method produces (`ip`, `upnp`, `mdns`, `serial`, ...) */
    type: string;
    /** Scan duration in ms */
    timeout: number;
    /** The adapter configuration - note that this replaces any `exports.options` of the module */
    options: ioBroker.AdapterConfig;
    /**
     * Shared stop flags, keyed by method name.
     *
     * Methods test it both ways - `self.halt === true` and `self.halt['ping']` - because
     * `haltAllMethods()` is meant to replace the whole object with `true`. Hence the loose
     * type.
     */
    halt: any;
    log: ioBroker.Logger;
    adapter: ioBroker.Adapter;
    foundCount: number;
    progress: number;

    /** Report a device; `null` finishes the method */
    add: (device: DiscoveryDevice | null) => unknown;
    /** Alias of {@link MethodInstance.add} */
    addDevice: (device: DiscoveryDevice | null) => unknown;
    /** Look up an already reported device */
    get: (ip: string, type?: string) => DiscoveryDevice | undefined;
    /** Tell the core how far this method got (0..100) */
    updateProgress: (progress?: number) => void;
    /** Finish this method - accepted only once */
    done: (error?: unknown) => void;
    /** Stop searching. A method may overwrite this to close its sockets first. */
    close: (error?: unknown) => void;
    /** Arm the scan timeout and the progress ticker */
    setTimeout: (timeout: number, options?: MethodTimeoutOptions) => void;
    /** Same function as {@link MethodInstance.setTimeout} */
    setInterval: (timeout: number, options?: MethodTimeoutOptions) => void;

    [key: string]: any;
}

/** The contract every module in `lib/methods/` fulfills */
export interface MethodModule {
    browse: (self: MethodInstance) => void;
    /** Defaults to the file name */
    source?: string;
    type: string;
    timeout?: number;
    options?: ProtocolData;
    foundCount?: number;
    progress?: number;
    [key: string]: any;
}
