// Augments the globally declared ioBroker types with everything this adapter adds.
// Keep in sync with `native` in io-package.json.
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** Time a single ping is allowed to take, in ms */
            pingTimeout: number;
            /** Restrict the ping scan to this local address instead of scanning every interface */
            pingOwnIP: string;
            /** Netmask that goes with `pingOwnIP` */
            pingOwnNetmask: string;
            /** How many addresses are pinged at once */
            pingBlock: number;
            /** Propose only adapters that are installed on this host */
            onlyLocal: boolean;

            /**
             * Not part of `native`: the core sets this before a scan so that the ping method
             * stops as soon as TR-064 has delivered the router's device list.
             */
            stopPingOnTR064Ready?: boolean;
        }
    }
}

export {}; // needed so that this file is treated as a module
