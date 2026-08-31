'use strict';

/**
 * Tests for the notification a scheduled scan raises.
 *
 * Nobody watches a scan on a timer - admin subscribes to `system.discovery` only while the
 * discovery dialog is open - so the adapter has to say by itself when it found something. What
 * counts as "found something", and what the notification carries, lives in lib/notification and
 * is checked here without a running ioBroker.
 */

const assert = require('node:assert');
const path = require('node:path');

const notification = require(path.join('..', 'build', 'lib', 'notification.js'));

const LANGUAGES = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

describe('what a scan newly proposes', () => {
    const jarvis = { _id: 'system.adapter.jarvis.0', common: { name: 'jarvis' } };
    const shelly = { _id: 'system.adapter.shelly.0', common: { name: 'shelly' } };

    it('reports everything of the very first scan', () => {
        assert.deepStrictEqual(notification.newProposals([], [jarvis, shelly]), [jarvis, shelly]);
        assert.deepStrictEqual(notification.newProposals(undefined, [jarvis]), [jarvis]);
        assert.deepStrictEqual(notification.newProposals(null, [jarvis]), [jarvis]);
    });

    it('says nothing about what the scan before already proposed', () => {
        // the point of the whole thing: an hourly scan finds the same devices every hour
        assert.deepStrictEqual(notification.newProposals([jarvis], [jarvis, shelly]), [shelly]);
        assert.deepStrictEqual(notification.newProposals([jarvis, shelly], [jarvis, shelly]), []);
    });

    it('leaves out what the user ignored', () => {
        const ignored = { _id: 'system.adapter.canbus.0', common: { name: 'canbus' }, comment: { ack: true } };
        assert.deepStrictEqual(notification.newProposals([], [ignored, shelly]), [shelly]);
    });

    it('copes with the shapes system.discovery has carried over the years', () => {
        // the acknowledge block of main.ts turns entries into JSON on the way
        assert.deepStrictEqual(notification.newProposals([JSON.stringify(jarvis)], [jarvis, shelly]), [shelly]);
        // and a very old instance stored plain ids
        assert.deepStrictEqual(notification.newProposals(['system.adapter.jarvis.0'], [jarvis, shelly]), [shelly]);
        assert.deepStrictEqual(notification.newProposals([null, undefined, {}], [jarvis]), [jarvis]);
    });

    it('copes with a scan that proposed nothing', () => {
        assert.deepStrictEqual(notification.newProposals([jarvis], []), []);
        assert.deepStrictEqual(notification.newProposals([jarvis], undefined), []);
    });
});

describe('the comment of a proposal in one line', () => {
    it('names the devices the proposal would cover', () => {
        assert.strictEqual(
            notification.commentText({ add: ['192.168.1.1', '192.168.1.2'] }),
            'add: 192.168.1.1, 192.168.1.2',
        );
        assert.strictEqual(notification.commentText({ extended: '192.168.1.9' }), 'extended: 192.168.1.9');
    });

    it('counts instead of listing when there are many', () => {
        assert.strictEqual(notification.commentText({ add: ['1', '2', '3', '4', '5', '6'] }), 'add: 6');
    });

    it('takes the free text along', () => {
        assert.strictEqual(notification.commentText({ add: ['1'], text: 'Requires a token' }), 'add: 1, Requires a token');
        assert.strictEqual(notification.commentText({ text: 'Provides visualization' }), 'Provides visualization');
    });

    it('says nothing when there is nothing to say', () => {
        assert.strictEqual(notification.commentText(undefined), '');
        assert.strictEqual(notification.commentText({}), '');
    });
});

describe('what the notification carries', () => {
    it('keeps the name and the comment, and nothing else', () => {
        const summary = notification.summarise([
            {
                _id: 'system.adapter.shelly.0',
                common: { name: 'shelly' },
                native: { user: 'admin', password: 'secret' },
                comment: { add: ['192.168.1.50'] },
            },
        ]);

        assert.deepStrictEqual(summary, [
            { id: 'system.adapter.shelly.0', name: 'shelly', comment: 'add: 192.168.1.50' },
        ]);
        // a notification is stored and handed around - the instance configuration has no
        // business in it
        assert.ok(!JSON.stringify(summary).includes('secret'));
    });

    it('falls back to the adapter name in the id', () => {
        const summary = notification.summarise([{ _id: 'system.adapter.canbus.0', common: {} }]);
        assert.strictEqual(summary[0].name, 'canbus');
        assert.ok(!('comment' in summary[0]), 'no empty comment is carried');
    });
});

describe('the line of the notification list', () => {
    it('counts in the language of the installation', () => {
        assert.match(notification.message(1, 'en'), /a new adapter proposal/);
        assert.match(notification.message(3, 'en'), /3 new adapter proposals/);
        assert.match(notification.message(3, 'de'), /3 neue Adaptervorschläge/);
        assert.ok(!notification.message(3, 'ru').includes('%s'), 'the number is substituted everywhere');
    });

    it('falls back to English for a language it does not have', () => {
        assert.strictEqual(notification.message(2, 'xx'), notification.message(2, 'en'));
        assert.strictEqual(notification.message(2, undefined), notification.message(2, 'en'));
    });
});

describe('the detail view admin asks for', () => {
    const proposals = [
        { id: 'system.adapter.shelly.0', name: 'shelly', comment: 'add: 192.168.1.50' },
        { id: 'system.adapter.jarvis.0', name: 'jarvis' },
    ];

    it('is a jsonConfig panel with one line per proposal', () => {
        const schema = notification.notificationSchema(proposals);

        assert.strictEqual(schema.type, 'panel');
        assert.strictEqual(schema.items._proposal_0.text, 'shelly - add: 192.168.1.50');
        assert.strictEqual(schema.items._proposal_1.text, 'jarvis');
        // an adapter name is not a word to translate
        assert.strictEqual(schema.items._proposal_0.noTranslation, true);
        assert.ok(schema.items._hint, 'and it says where to act on them');
    });

    it('says so when there is nothing left to show', () => {
        const schema = notification.notificationSchema([]);

        assert.ok(schema.items._gone, 'the proposals were created or ignored in the meantime');
        assert.ok(!schema.items._hint);
        assert.deepStrictEqual(notification.notificationSchema(undefined).items._gone, schema.items._gone);
    });

    it('hands its own texts over translated, admin cannot know them', () => {
        const schema = notification.notificationSchema(proposals);

        for (const key of ['_header', '_hint']) {
            assert.deepStrictEqual(Object.keys(schema.items[key].text).sort(), [...LANGUAGES].sort(), key);
        }
    });
});

describe('the offline text of the notification', () => {
    it('is there in every language', () => {
        assert.deepStrictEqual(Object.keys(notification.OFFLINE_MESSAGE).sort(), [...LANGUAGES].sort());
    });
});
