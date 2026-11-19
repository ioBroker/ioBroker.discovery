/**
 * Which detection modules a scan runs: those whose adapter this installation can install. (#508)
 *
 * The build makes sure that every adapter a module proposes exists at all - in the latest
 * repository (`scripts/proposedAdapters.js`). Whether it is in the repository *this* installation
 * installs from is known only here: js-controller keeps the repositories it has loaded in
 * `system.repositories`, and `system.config common.activeRepo` says which of them are in use. A
 * detection whose adapter is not in them is not run - its proposal could not be followed, and
 * while an adapter is in latest only, a user on stable is not offered it.
 *
 * A detection module is named after its adapter: `lib/adapters/shelly.js` detects for `shelly`.
 */

/**
 * The part of `system.repositories native` this module reads. Every repository js-controller
 * knows has an entry; its `json` - the repository keyed by adapter name - is `null` until it was
 * downloaded.
 */
export interface RepositoriesNative {
    repositories?: Record<string, { json?: object | null } | null | undefined>;
}

/**
 * The adapters the active repositories offer, or `null` when that is not known.
 *
 * `activeRepo` is a single name on older js-controllers and a list on newer ones, which can have
 * several repositories active at once - admin installs from any of them, so their adapters add
 * up. A list used to be turned into one key with `String()`, which named no repository as soon as
 * it had a second entry, and then every module ran.
 *
 * `null` - and with it no limit at all - when no repository is active or one of the active ones
 * has not been downloaded yet: a fresh installation, or one that has not reached the repository
 * server. Running every detection then is better than running none.
 *
 * @param native `native` of `system.repositories`
 * @param activeRepo `common.activeRepo` of `system.config`
 */
export function activeRepositoryAdapters(
    native: RepositoriesNative | null | undefined,
    activeRepo: string | string[] | null | undefined,
): Set<string> | null {
    const names = (Array.isArray(activeRepo) ? activeRepo : [activeRepo]).filter(
        (name): name is string => typeof name === 'string' && name !== '',
    );
    if (!names.length) {
        return null;
    }

    const adapters = new Set<string>();
    for (const name of names) {
        const json = native?.repositories?.[name]?.json;
        if (!json || typeof json !== 'object') {
            return null;
        }
        for (const adapter of Object.keys(json)) {
            // `_repoInfo` and the like describe the repository, they are no adapters
            if (!adapter.startsWith('_')) {
                adapters.add(adapter);
            }
        }
    }
    return adapters;
}

/**
 * Whether the detection module of an adapter runs in this scan.
 *
 * @param adapterName the adapter the module detects - its file name
 * @param available what {@link activeRepositoryAdapters} returned; `null` lets every module run
 * @param installed set when only installed adapters may be proposed (`native.onlyLocal`): whether
 *   the adapter is installed on this host
 */
export function mayDetect(
    adapterName: string,
    available: Set<string> | null,
    installed?: (adapterName: string) => boolean,
): boolean {
    if (available && !available.has(adapterName)) {
        return false;
    }
    return !installed || installed(adapterName);
}
