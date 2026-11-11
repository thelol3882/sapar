import { beforeEach, describe, expect, it } from 'vitest';
import { defineAnnouncement, defineTour } from '../define';
import { memoryStore } from '../stores';
import type { KeyValueStore, ProgressInput } from '../types';
import { memorySource } from './memory';
import type { MemorySourceOptions } from './memory';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-06-01T00:00:00Z');

const onboarding = defineTour({
    key: 'onboarding',
    title: { en: 'Onboarding', ru: 'Знакомство' },
    trigger: { route: '/dashboard' },
    steps: [{ key: 'intro', title: { en: 'Hi', ru: 'Привет' }, body: 'Welcome' }],
});
const billing = defineTour({ key: 'billing', title: 'Billing', trigger: { route: '/billing/*' }, steps: [{ key: 'a', title: 'A', body: 'B' }] });
const manual = defineTour({ key: 'manual', title: 'Manual', steps: [{ key: 'a', title: 'A', body: 'B' }] });

const news = (key: string, publishedAt: string, extra: Partial<Parameters<typeof defineAnnouncement>[0]> = {}) =>
    defineAnnouncement({ key, title: key, body: 'Body', publishedAt, ...extra });

function progress(key: string, status: ProgressInput['status'], extra: Partial<ProgressInput> = {}): ProgressInput {
    return { key, revision: 1, status, stepIndex: 0, autoStarted: false, ...extra };
}

describe('memorySource', () => {
    let storage: KeyValueStore;
    let time: number;

    const create = (options: Partial<MemorySourceOptions> = {}) =>
        memorySource({
            tours: [onboarding, billing, manual],
            storage,
            now: () => time,
            registeredAt: new Date(T0 - 365 * DAY),
            ...options,
        });
    const interruptionAt = async (source = create(), route = '/dashboard') =>
        (await source.getInbox({ route, platform: 'web' })).interruption;

    beforeEach(() => {
        storage = memoryStore();
        time = T0;
    });

    describe('tour interruptions', () => {
        it('offers a matching route tour to an established user', async () => {
            const interruption = await interruptionAt();

            expect(interruption).toMatchObject({ kind: 'tour', tour: { key: 'onboarding', title: 'Onboarding' } });
        });

        it('offers a tour only on the platforms it targets', async () => {
            const webOnly = defineTour({ ...onboarding, platforms: ['web'] });
            const source = create({ tours: [webOnly] });

            expect(await source.getInbox({ route: '/dashboard', platform: 'web' })).toMatchObject({ interruption: { kind: 'tour' } });
            expect(await source.getInbox({ route: '/dashboard', platform: 'native' })).toMatchObject({ interruption: null });
        });

        it('offers nothing without a route, on other routes, or for manual tours', async () => {
            const source = create();

            expect((await source.getInbox({ platform: 'web' })).interruption).toBeNull();
            expect(await interruptionAt(source, '/settings')).toBeNull();
        });

        it('stays quiet through the new-user grace', async () => {
            const source = create({ registeredAt: new Date(T0 - 2 * DAY) });
            expect(await interruptionAt(source)).toBeNull();

            time += 1 * DAY;
            expect(await interruptionAt(source)).not.toBeNull();
        });

        it('cools down after an automatic start but not after a manual one', async () => {
            const source = create();
            await source.recordProgress(progress('manual', 'started'));
            expect(await interruptionAt(source)).not.toBeNull();

            await source.recordProgress(progress('onboarding', 'started', { autoStarted: true }));
            await source.recordProgress(progress('onboarding', 'dismissed', { autoStarted: false }));
            expect(await interruptionAt(source, '/billing')).toBeNull();

            time += 24 * HOUR;
            expect(await interruptionAt(source, '/billing')).toMatchObject({ tour: { key: 'billing' } });
        });

        it('never re-offers a completed tour, and re-offers after a revision bump', async () => {
            const source = create();
            await source.recordProgress(progress('onboarding', 'completed'));
            expect(await interruptionAt(source)).toBeNull();

            const bumped = create({ tours: [{ ...onboarding, revision: 2 }] });
            expect(await interruptionAt(bumped)).toMatchObject({ tour: { key: 'onboarding', revision: 2 } });
        });

        it('keeps completion even when a stale tab reports an earlier status', async () => {
            const source = create();
            await source.recordProgress(progress('onboarding', 'completed', { stepIndex: 3 }));
            await source.recordProgress(progress('onboarding', 'started'));

            expect(await interruptionAt(source)).toBeNull();
        });

        it('re-offers a dismissed tour only after the backoff', async () => {
            const source = create({ policy: { cooldownHours: 0 } });
            await source.recordProgress(progress('onboarding', 'dismissed'));
            expect(await interruptionAt(source)).toBeNull();

            time += 30 * DAY - 1;
            expect(await interruptionAt(source)).toBeNull();
            time += 1;
            expect(await interruptionAt(source)).not.toBeNull();
        });

        it('re-offers an abandoned tour once the cooldown is over', async () => {
            const source = create();
            await source.recordProgress(progress('onboarding', 'started', { autoStarted: true }));
            time += 24 * HOUR;

            expect(await interruptionAt(source)).toMatchObject({ tour: { key: 'onboarding' } });
        });

        it('honours a custom policy', async () => {
            const source = create({ registeredAt: new Date(T0), policy: { newUserGraceDays: 0 } });

            expect(await interruptionAt(source)).not.toBeNull();
        });

        it('rejects progress for an unknown tour', async () => {
            await expect(create().recordProgress(progress('ghost', 'started'))).rejects.toThrow(/No tour/);
        });
    });

    describe('announcements', () => {
        const announcements = [
            news('old', '2026-01-01T00:00:00Z'),
            news('modal', '2026-03-01T00:00:00Z', { tier: 'modal' }),
            news('quiet', '2026-02-01T00:00:00Z', { tier: 'silent' }),
            news('future', '2026-07-01T00:00:00Z'),
        ];

        it('hides future items, sorts newest first and counts unread non-silent items', async () => {
            const inbox = await create({ announcements, tours: [] }).getInbox({ platform: 'web' });

            expect(inbox.items.map((item) => item.key)).toEqual(['modal', 'quiet', 'old']);
            expect(inbox.unreadCount).toBe(2);
        });

        it('publishes an item once its time comes', async () => {
            const source = create({ announcements });
            time = Date.parse('2026-07-01T00:00:00Z');

            expect((await source.listAnnouncements())[0]?.key).toBe('future');
        });

        it('interrupts with an unread modal and prefers a tour', async () => {
            const source = create({ announcements });

            expect(await interruptionAt(source, '/settings')).toMatchObject({ kind: 'announcement', announcement: { key: 'modal' } });
            expect(await interruptionAt(source, '/dashboard')).toMatchObject({ kind: 'tour' });
        });

        it('stops interrupting once the modal is dismissed, but keeps it in the feed', async () => {
            const source = create({ announcements, tours: [] });
            await source.dismiss('modal');

            const inbox = await source.getInbox({ platform: 'web' });

            expect(inbox.interruption).toBeNull();
            expect(inbox.items.find((item) => item.key === 'modal')?.unread).toBe(false);
        });

        it('markSeen clears unread and persists across source instances on one store', async () => {
            await create({ announcements, tours: [] }).markSeen(['old', 'modal', 'unknown']);

            const inbox = await create({ announcements, tours: [] }).getInbox({ platform: 'web' });

            expect(inbox.items.map((item) => [item.key, item.unread])).toEqual([
                ['modal', false],
                ['quiet', true],
                ['old', false],
            ]);
            expect(inbox.unreadCount).toBe(0);
        });

        it('treats a click as seen and rejects unknown keys', async () => {
            const source = create({ announcements, tours: [] });
            await source.recordClick('old');

            expect((await source.listAnnouncements()).find((item) => item.key === 'old')?.unread).toBe(false);
            await expect(source.recordClick('ghost')).rejects.toThrow(/No announcement/);
            await expect(source.dismiss('ghost')).rejects.toThrow(/No announcement/);
        });

        it('resolves text for the current locale', async () => {
            let locale = 'ru';
            const source = create({
                locale: () => locale,
                announcements: [news('a', '2026-01-01T00:00:00Z', { title: { en: 'Hello', ru: 'Привет' } })],
            });

            expect((await source.listAnnouncements())[0]?.title).toBe('Привет');
            locale = 'kk';
            expect((await source.listAnnouncements())[0]?.title).toBe('Hello');
            expect((await source.getTour('onboarding'))?.title).toBe('Onboarding');
        });
    });

    describe('getTour', () => {
        it('returns the resolved tour or null', async () => {
            const source = create({ locale: 'ru' });

            expect((await source.getTour('onboarding'))?.steps[0]?.title).toBe('Привет');
            expect(await source.getTour('ghost')).toBeNull();
        });
    });

    describe('translate', () => {
        const messages: Record<string, string> = {
            'tour.title': 'Welcome',
            'step.title': 'First',
            'step.body': 'Look here',
            'news.title': 'News',
            'news.body': 'It changed',
            'news.cta': 'Read',
        };
        const translate = (text: string): string => messages[text] ?? text;
        const keyed = defineTour({
            key: 'keyed',
            title: 'tour.title',
            trigger: { route: '/keyed' },
            steps: [{ key: 'a', title: 'step.title', body: 'step.body' }],
        });
        const keyedNews = news('keyed_news', '2026-01-01T00:00:00Z', {
            title: 'news.title',
            body: 'news.body',
            cta: { label: 'news.cta', url: '/news' },
        });

        it('applies to the tour and its steps, in getTour and in an offered interruption', async () => {
            const source = create({ tours: [keyed], translate });
            const expected = { title: 'Welcome', steps: [{ key: 'a', title: 'First', body: 'Look here' }] };

            expect(await source.getTour('keyed')).toMatchObject(expected);
            expect(await interruptionAt(source, '/keyed')).toMatchObject({ kind: 'tour', tour: expected });
        });

        it('applies to the announcement title, body and call to action, leaving the url alone', async () => {
            const source = create({ announcements: [keyedNews], translate });

            expect((await source.listAnnouncements())[0]).toMatchObject({
                title: 'News',
                body: 'It changed',
                cta: { label: 'Read', url: '/news' },
            });
            expect((await source.getInbox({ platform: 'web' })).items[0]?.title).toBe('News');
        });

        it('runs after locale resolution and follows a stable function that changes its answer', async () => {
            let prefix = 'en';
            const source = create({
                tours: [defineTour({ key: 'keyed', title: { en: 'tour.title', ru: 'tour.title.ru' }, steps: [{ key: 'a', title: 'A', body: 'B' }] })],
                locale: () => prefix,
                translate: (text) => `${prefix}:${text}`,
            });

            expect((await source.getTour('keyed'))?.title).toBe('en:tour.title');
            prefix = 'ru';
            expect((await source.getTour('keyed'))?.title).toBe('ru:tour.title.ru');
        });
    });

    describe('persistence', () => {
        it('survives a new source on the same store and honours the namespace', async () => {
            await create().recordProgress(progress('onboarding', 'completed'));

            expect(await interruptionAt(create())).toBeNull();
            expect(await interruptionAt(create({ namespace: 'other' }))).not.toBeNull();
            expect(storage.get('sapar.tour-records')).toContain('onboarding@1');
        });

        it('resets corrupt or foreign stored data', async () => {
            await storage.set('sapar.tour-records', '{not json');
            await storage.set('sapar.seen', '{"a":1}');
            await storage.set('sapar.dismissed', 'null');
            const source = create({ announcements: [news('a', '2026-01-01T00:00:00Z')] });

            expect(await interruptionAt(source)).not.toBeNull();
            expect((await source.listAnnouncements())[0]?.unread).toBe(true);
            await source.markSeen(['a']);
            expect((await source.listAnnouncements())[0]?.unread).toBe(false);
        });

        it('works with an asynchronous store and does not lose concurrent writes', async () => {
            const backing = memoryStore();
            const slow: KeyValueStore = {
                get: async (key) => {
                    await Promise.resolve();
                    return backing.get(key);
                },
                set: async (key, value) => {
                    await Promise.resolve();
                    await backing.set(key, value);
                },
                remove: (key) => backing.remove(key),
            };
            storage = slow;
            const source = create({ announcements: [news('a', '2026-01-01T00:00:00Z'), news('b', '2026-01-02T00:00:00Z')] });

            await Promise.all([source.markSeen(['a']), source.markSeen(['b']), source.recordProgress(progress('onboarding', 'completed'))]);

            expect((await source.listAnnouncements()).map((item) => item.unread)).toEqual([false, false]);
            expect(await interruptionAt(source)).toBeNull();
        });
    });
});
