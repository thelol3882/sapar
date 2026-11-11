import { describe, expect, expectTypeOf, it } from 'vitest';
import {
    defineAnchors,
    defineAnnouncement,
    defineTour,
    resolveAnnouncement,
    resolveText,
    resolveTour,
} from './define';
import type { AnchorKey } from './define';
import { EN } from './fixtures';

const step = { key: 'intro', title: 'Hi', body: 'Welcome' };

describe('defineTour', () => {
    it('fills defaults', () => {
        const tour = defineTour({ key: 'onboarding', title: 'Onboarding', steps: [step] });

        expect(tour).toEqual({
            key: 'onboarding',
            revision: 1,
            title: 'Onboarding',
            trigger: 'manual',
            steps: [{ ...step, placement: 'auto', padding: 8, required: false, advanceOn: 'next' }],
        });
    });

    it('lets explicit step values override defaults but not explicit undefined', () => {
        const [first] = defineTour({
            key: 'tour',
            title: 'T',
            steps: [{ ...step, anchor: 'nav.menu', placement: 'left', padding: 0, advanceOn: 'press', required: undefined }],
        }).steps;

        expect(first).toMatchObject({ anchor: 'nav.menu', placement: 'left', padding: 0, advanceOn: 'press', required: false });
    });

    it.each(['Bad', 'a-b', 'a..b', '.a', 'a.', '', 'a b'])('rejects tour key %j', (key) => {
        expect(() => defineTour({ key, title: 'T', steps: [step] })).toThrow(/Invalid tour key/);
    });

    it('rejects invalid step and anchor keys', () => {
        expect(() => defineTour({ key: 't', title: 'T', steps: [{ ...step, key: 'Bad' }] })).toThrow(/Invalid step/);
        expect(() => defineTour({ key: 't', title: 'T', steps: [{ ...step, anchor: 'bad-anchor' }] })).toThrow(
            /Invalid anchor of step "intro"/,
        );
    });

    it('rejects duplicate step keys', () => {
        expect(() => defineTour({ key: 't', title: 'T', steps: [step, step] })).toThrow(/Duplicate step.*"intro"/);
    });

    it('rejects an invalid route pattern but accepts valid ones', () => {
        expect(() => defineTour({ key: 't', title: 'T', trigger: { route: '/a/*/b' }, steps: [step] })).toThrow(
            /invalid route pattern/,
        );
        expect(defineTour({ key: 't', title: 'T', trigger: { route: '/a/*' }, steps: [step] }).trigger).toEqual({
            route: '/a/*',
        });
    });

    it('rejects a bad revision and an empty tour', () => {
        expect(() => defineTour({ key: 't', title: 'T', revision: 0, steps: [step] })).toThrow(/revision/);
        expect(() => defineTour({ key: 't', title: 'T', steps: [] })).toThrow(/at least one step/);
    });
});

describe('defineAnnouncement', () => {
    it('defaults the tier to feed', () => {
        const announcement = defineAnnouncement({ key: 'a', title: 'A', body: 'B', publishedAt: '2026-01-01T00:00:00Z' });
        expect(announcement.tier).toBe('feed');
    });

    it('rejects an unparseable publishedAt', () => {
        expect(() => defineAnnouncement({ key: 'a', title: 'A', body: 'B', publishedAt: 'soon' })).toThrow(/publishedAt/);
    });
});

describe('defineAnchors', () => {
    it('returns the keys and exposes their union type', () => {
        const anchors = defineAnchors(['nav.menu', 'billing.export'] as const);

        expect(anchors).toEqual(['nav.menu', 'billing.export']);
        expectTypeOf<AnchorKey<typeof anchors>>().toEqualTypeOf<'nav.menu' | 'billing.export'>();
    });

    it('rejects invalid and duplicate keys', () => {
        expect(() => defineAnchors(['Nav'])).toThrow(/Invalid anchor/);
        expect(() => defineAnchors(['a', 'a'])).toThrow(/Duplicate anchor/);
    });
});

describe('resolveText', () => {
    it('picks the locale, then the fallback, then empty', () => {
        expect(resolveText('plain', 'ru', 'en')).toBe('plain');
        expect(resolveText({ en: 'Hello', ru: 'Privet' }, 'ru', 'en')).toBe('Privet');
        expect(resolveText({ en: 'Hello' }, 'ru', 'en')).toBe('Hello');
        expect(resolveText({ kk: 'Salem' }, 'ru', 'en')).toBe('');
    });
});

describe('resolvers', () => {
    it('resolves a tour into plain strings', () => {
        const tour = defineTour({
            key: 't',
            title: { en: 'Tour', ru: 'Тур' },
            steps: [{ key: 's', title: { en: 'Step', ru: 'Шаг' }, body: 'Body' }],
        });

        const resolved = resolveTour(tour, { locale: 'ru', fallbackLocale: 'en' });

        expect(resolved.title).toBe('Тур');
        expect(resolved.steps[0]).toMatchObject({ key: 's', title: 'Шаг', body: 'Body', padding: 8 });
    });

    it('resolves an announcement with cta and unread flag', () => {
        const announcement = defineAnnouncement({
            key: 'a',
            title: 'A',
            body: 'B',
            tier: 'modal',
            cta: { label: { en: 'Open', ru: 'Открыть' }, url: '/x' },
            publishedAt: '2026-01-01T00:00:00Z',
            tourKey: 'tour',
        });

        expect(resolveAnnouncement(announcement, { locale: 'ru', fallbackLocale: 'en' }, true)).toEqual({
            key: 'a',
            tier: 'modal',
            title: 'A',
            body: 'B',
            cta: { label: 'Открыть', url: '/x' },
            publishedAt: '2026-01-01T00:00:00Z',
            tourKey: 'tour',
            unread: true,
        });
        expect(resolveAnnouncement({ ...announcement, cta: undefined }, EN, false)).not.toHaveProperty('cta');
    });
});
