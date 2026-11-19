'use strict';

/**
 * Tests for the run-time half of #508: a detection module runs only when its adapter is in the
 * repository this installation installs from.
 */

const assert = require('node:assert');
const path = require('node:path');

const repository = require(path.join('..', 'build', 'lib', 'repository.js'));

const stable = { link: 'stable', json: { _repoInfo: {}, shelly: {}, knx: {} } };
const beta = { link: 'beta', json: { _repoInfo: {}, shelly: {}, tapo: {} } };
const own = { link: 'own', json: { myadapter: {} } };

describe('the adapters of the active repository', () => {
    it('a single name, as older js-controllers store it', () => {
        const adapters = repository.activeRepositoryAdapters({ repositories: { stable, beta } }, 'stable');
        assert.deepStrictEqual([...adapters].sort(), ['knx', 'shelly']);
    });

    it('a list with one entry, as newer js-controllers store it', () => {
        const adapters = repository.activeRepositoryAdapters({ repositories: { stable, beta } }, ['beta']);
        assert.deepStrictEqual([...adapters].sort(), ['shelly', 'tapo']);
    });

    it('several active repositories add up', () => {
        // This used to be String(['stable', 'own']) = 'stable,own', which named no repository
        // at all - and then every module ran.
        const adapters = repository.activeRepositoryAdapters({ repositories: { stable, own } }, ['stable', 'own']);
        assert.deepStrictEqual([...adapters].sort(), ['knx', 'myadapter', 'shelly']);
    });

    it('the meta entries of a repository are no adapters', () => {
        const adapters = repository.activeRepositoryAdapters({ repositories: { stable } }, 'stable');
        assert.strictEqual(adapters.has('_repoInfo'), false);
    });

    it('not known while an active repository has not been downloaded yet', () => {
        const fresh = { link: 'stable', json: null };
        assert.strictEqual(repository.activeRepositoryAdapters({ repositories: { stable: fresh } }, 'stable'), null);
        assert.strictEqual(
            repository.activeRepositoryAdapters({ repositories: { stable, own: { link: 'own' } } }, ['stable', 'own']),
            null,
        );
    });

    it('not known without an active repository or without the object', () => {
        assert.strictEqual(repository.activeRepositoryAdapters({ repositories: { stable } }, undefined), null);
        assert.strictEqual(repository.activeRepositoryAdapters({ repositories: { stable } }, []), null);
        assert.strictEqual(repository.activeRepositoryAdapters({ repositories: { stable } }, 'unknown'), null);
        assert.strictEqual(repository.activeRepositoryAdapters(undefined, 'stable'), null);
    });
});

describe('which detection runs', () => {
    const available = new Set(['shelly', 'knx']);

    it('one for an adapter of the active repository', () => {
        assert.strictEqual(repository.mayDetect('shelly', available), true);
    });

    it('none for an adapter the active repository does not have, e.g. one in latest only', () => {
        assert.strictEqual(repository.mayDetect('tapo', available), false);
    });

    it('every one while the repository is not known', () => {
        assert.strictEqual(repository.mayDetect('tapo', null), true);
    });

    it('with "only installed adapters", one for an installed adapter only', () => {
        const installed = name => name === 'knx';
        assert.strictEqual(repository.mayDetect('knx', available, installed), true);
        assert.strictEqual(repository.mayDetect('shelly', available, installed), false);
    });

    it('with "only installed adapters", that holds while the repository is not known, too', () => {
        const installed = name => name === 'knx';
        assert.strictEqual(repository.mayDetect('knx', null, installed), true);
        assert.strictEqual(repository.mayDetect('tapo', null, installed), false);
    });
});
