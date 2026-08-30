'use strict';

/**
 * Tests for the start-up repair of `common.adminUI.config`.
 *
 * js-controller copies `common` out of io-package.json at install time and does not carry the
 * nested `adminUI` over on an update. An installation set up while this adapter still said
 * `"none"` would therefore never show a settings button, and the scheduled scan could not be
 * switched on - so the adapter puts it right itself.
 */

const assert = require('node:assert');
const path = require('node:path');

const migration = require(path.join('..', 'build', 'lib', 'migration.js'));

describe('what has to be repaired', () => {
    it('an installation from before the settings dialog', () => {
        assert.strictEqual(migration.needsAdminUiMigration({ adminUI: { config: 'none' } }), true);
    });

    it('an object that never had the field at all', () => {
        assert.strictEqual(migration.needsAdminUiMigration({ name: 'discovery' }), true);
        assert.strictEqual(migration.needsAdminUiMigration({ adminUI: {} }), true);
    });

    it('nothing, once it says json', () => {
        assert.strictEqual(migration.needsAdminUiMigration({ adminUI: { config: 'json' } }), false);
    });

    it('nothing, when there is no object to repair', () => {
        assert.strictEqual(migration.needsAdminUiMigration(null), false);
        assert.strictEqual(migration.needsAdminUiMigration(undefined), false);
    });
});

describe('the patch', () => {
    it('sets the value io-package declares', () => {
        assert.deepStrictEqual(migration.adminUiPatch({ adminUI: { config: 'none' } }), {
            common: { adminUI: { config: 'json' } },
        });
        assert.strictEqual(migration.ADMIN_UI_CONFIG, 'json');
    });

    it('leaves the rest of adminUI alone', () => {
        // `tab` and `custom` belong to other features and must survive
        const patch = migration.adminUiPatch({ adminUI: { config: 'none', tab: true, custom: 'json' } });

        assert.deepStrictEqual(patch.common.adminUI, { config: 'json', tab: true, custom: 'json' });
    });

    it('works on an object that has no adminUI yet', () => {
        assert.deepStrictEqual(migration.adminUiPatch({}), { common: { adminUI: { config: 'json' } } });
        assert.deepStrictEqual(migration.adminUiPatch(null), { common: { adminUI: { config: 'json' } } });
    });

    it('touches nothing but common.adminUI', () => {
        const patch = migration.adminUiPatch({ name: 'discovery', adminUI: { config: 'none' } });

        assert.deepStrictEqual(Object.keys(patch), ['common']);
        assert.deepStrictEqual(Object.keys(patch.common), ['adminUI']);
    });
});

describe('which objects are repaired', () => {
    it('the adapter object and this instance', () => {
        // admin renders the dialog from the instance, a new instance is copied from the adapter
        assert.deepStrictEqual(migration.adminUiObjectIds('discovery.0', 'discovery'), [
            'system.adapter.discovery',
            'system.adapter.discovery.0',
        ]);
    });

    it('never a foreign instance', () => {
        const ids = migration.adminUiObjectIds('discovery.2', 'discovery');

        assert.ok(!ids.includes('system.adapter.discovery.0'));
        assert.ok(ids.includes('system.adapter.discovery.2'));
    });
});
