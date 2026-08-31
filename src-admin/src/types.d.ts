/** One device of the last scan, as `system.discovery` stores it */
export interface DiscoveryDevice {
    _addr: string;
    _name?: string;
    _type?: string;
    _source?: string;
    /** Names of the detection modules that recognised this device */
    _detected?: string[];
}

/** The columns of the table, which are also what can be sorted and filtered by */
export type SortColumn = 'address' | 'name' | 'type' | 'source' | 'detected';
