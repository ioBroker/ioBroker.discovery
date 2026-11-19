'use strict';

/**
 * Tests for the build-time half of #508: which adapters the sources can propose.
 *
 * The comparison with the repository itself needs the network and runs in its own CI job
 * (`node scripts/proposedAdapters.js`). What is tested here is that the reading of the sources
 * does not go blind: every name resolves, and every module is seen.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const check = require(path.join('..', 'scripts', 'proposedAdapters.js'));

describe('the adapters the sources propose', function () {
    // one TypeScript program over all sources
    this.timeout(60_000);

    let result;
    before(() => {
        result = check.proposedAdapters();
    });

    it('every name resolves to a string literal', () => {
        assert.deepStrictEqual(result.unresolved, []);
    });

    it('a literal, a const and the shared-instance helper are all read', () => {
        assert.deepStrictEqual(result.names.get('knx'), ['src/lib/adapters/knx.ts']); // getNextInstanceID('knx', ...)
        assert.deepStrictEqual(result.names.get('shelly'), ['src/lib/adapters/shelly.ts']); // proposeSharedInstance(adapterName, ...)
        assert.ok(result.names.get('web').length > 1, 'web is proposed alongside several adapters');
    });

    it('every detection module proposes something', () => {
        // A module that builds its proposal without the two helpers would drop out of the check
        // without anybody noticing - this is where it shows.
        const seen = new Set([...result.names.values()].flat());
        const silent = fs
            .readdirSync(path.join(__dirname, '..', 'src', 'lib', 'adapters'))
            .filter(file => file.endsWith('.ts'))
            .map(file => `src/lib/adapters/${file}`)
            .filter(file => !seen.has(file));
        assert.deepStrictEqual(silent, []);
    });
});

describe('the comparison with a repository', () => {
    const names = new Map([
        ['knx', ['src/lib/adapters/knx.ts']],
        ['gone', ['src/lib/adapters/gone.ts']],
        ['web', ['src/lib/adapters/cloud.ts', 'src/lib/adapters/vis-2.ts']],
    ]);

    it('the meta entries of a repository are no adapters', () => {
        assert.deepStrictEqual([...check.repositoryAdapters({ _repoInfo: {}, knx: {} })], ['knx']);
    });

    it('finds the adapters the repository does not have, with the modules proposing them', () => {
        const available = check.repositoryAdapters({ knx: {}, web: {} });
        assert.deepStrictEqual(check.missingAdapters(names, available), [
            { name: 'gone', files: ['src/lib/adapters/gone.ts'] },
        ]);
    });

    it('nothing when the repository has them all', () => {
        assert.deepStrictEqual(check.missingAdapters(names, new Set(['knx', 'gone', 'web'])), []);
    });

    it('the report names the adapter and its module', () => {
        const report = check.markdownReport(
            [{ name: 'gone', files: ['src/lib/adapters/gone.ts'] }],
            [],
            check.LATEST_REPOSITORY,
        );
        assert.match(report, /\| `gone` \| `src\/lib\/adapters\/gone\.ts` \|/);
        assert.match(report, /sources-dist\.json/);
    });

    it('the report lists the calls whose name could not be read', () => {
        const report = check.markdownReport(
            [],
            [{ file: 'src/lib/adapters/x.ts', line: 7, text: 'name' }],
            check.LATEST_REPOSITORY,
        );
        assert.match(report, /`src\/lib\/adapters\/x\.ts:7`/);
    });
});
