/**
 * One-time repairs the adapter has to do to its own objects at start-up.
 *
 * js-controller copies `common` out of `io-package.json` when an adapter is installed, and it
 * does not reliably bring nested fields along on an update. `common.adminUI.config` is one of
 * them: an installation that was set up while this adapter still declared `"none"` keeps that
 * value after the upgrade, and admin then shows no settings button - which leaves the
 * scheduled scan with no way to be switched on.
 *
 * So the adapter puts it right itself. The decision is separated from the writing so it can be
 * tested without a running ioBroker.
 */

/** What `io-package.json` declares - the value the stored objects have to match */
export const ADMIN_UI_CONFIG = 'json';

/** The part of `common` this repair looks at */
export interface AdminUiCommon {
    adminUI?: { config?: string; [key: string]: unknown };
    [key: string]: unknown;
}

/**
 * True if this object still carries an `adminUI.config` from before the settings dialog
 * existed.
 *
 * Anything that already says `json` is left alone, and so is an object without a `common` -
 * there is nothing to repair then.
 *
 * @param common the `common` section of an adapter or instance object
 */
export function needsAdminUiMigration(common: AdminUiCommon | null | undefined): boolean {
    if (!common || typeof common !== 'object') {
        return false;
    }
    return common.adminUI?.config !== ADMIN_UI_CONFIG;
}

/**
 * The patch that brings such an object in line, without touching anything else `adminUI` may
 * carry (`tab`, `custom`, ... belong to other features).
 *
 * @param common the `common` section of an adapter or instance object
 */
export function adminUiPatch(common: AdminUiCommon | null | undefined): {
    common: { adminUI: Record<string, unknown> };
} {
    return {
        common: {
            adminUI: {
                ...(common?.adminUI || {}),
                config: ADMIN_UI_CONFIG,
            },
        },
    };
}

/**
 * The objects that have to be repaired.
 *
 * Both matter: admin renders the settings dialog from the *instance* object, and the *adapter*
 * object is what every newly created instance is copied from.
 *
 * @param namespace the instance namespace, e.g. `discovery.0`
 * @param adapterName name of the adapter, e.g. `discovery`
 */
export function adminUiObjectIds(namespace: string, adapterName: string): string[] {
    return [`system.adapter.${adapterName}`, `system.adapter.${namespace}`];
}
