/**
 * Minimal typing for `mdns-discovery` - the package ships no types.
 *
 * Only the surface `lib/methods/mdns.ts` actually uses is declared; the library can do
 * more, but anything not listed here has never been exercised by this adapter.
 */
declare module 'mdns-discovery' {
    interface MdnsOptions {
        /** Scan duration in **seconds** (not ms) */
        timeout?: number;
        /** Service names to ask for, e.g. `_http._tcp.local` */
        name?: string[];
        /** Record type filter, `*` for everything */
        find?: string;
        broadcast?: boolean;
    }

    interface MdnsEntry {
        ip: string;
        name?: string;
        [key: string]: any;
    }

    class Mdns {
        constructor(options?: MdnsOptions);
        /** Suppress the question section in the outgoing query */
        noQuestions: boolean;
        on(event: 'entry', listener: (entry: MdnsEntry) => void): this;
        run(callback: (result?: unknown) => void): void;
        close(): void;
    }

    export = Mdns;
}
