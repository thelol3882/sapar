import { describe, expect, it } from 'vitest';
import { makeAnnouncement, makeTour } from './fixtures';
import { DEFAULT_POLICY, interruptionsAllowed, isTourOfferable, pickInterruption } from './policy';
import type { TourRecord } from './policy';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 100 * DAY;
const budget = { policy: DEFAULT_POLICY, now: NOW, registeredAt: null, lastAutoInterruptionAt: null };

const record = (overrides: Partial<TourRecord> = {}): TourRecord => ({
    status: 'started',
    revision: 1,
    lastStepIndex: 0,
    startedAt: 0,
    dismissedAt: null,
    autoStarted: false,
    ...overrides,
});

describe('DEFAULT_POLICY', () => {
    it('matches the backend defaults', () => {
        expect(DEFAULT_POLICY).toEqual({ newUserGraceDays: 3, cooldownHours: 24, dismissalBackoffDays: 30 });
    });
});

describe('interruptionsAllowed', () => {
    it('allows an unknown registration date and no history', () => {
        expect(interruptionsAllowed(budget)).toBe(true);
    });

    it('blocks inside the new-user grace and allows exactly at its end', () => {
        expect(interruptionsAllowed({ ...budget, registeredAt: NOW - 3 * DAY + 1 })).toBe(false);
        expect(interruptionsAllowed({ ...budget, registeredAt: NOW - 3 * DAY })).toBe(true);
    });

    it('blocks during the cooldown and allows exactly at its end', () => {
        expect(interruptionsAllowed({ ...budget, lastAutoInterruptionAt: NOW - 24 * HOUR + 1 })).toBe(false);
        expect(interruptionsAllowed({ ...budget, lastAutoInterruptionAt: NOW - 24 * HOUR })).toBe(true);
    });

    it('disables each gate with zero', () => {
        const policy = { ...DEFAULT_POLICY, newUserGraceDays: 0, cooldownHours: 0 };

        expect(interruptionsAllowed({ ...budget, policy, registeredAt: NOW, lastAutoInterruptionAt: NOW })).toBe(true);
    });
});

describe('isTourOfferable', () => {
    const offerable = (state: TourRecord | undefined, policy = DEFAULT_POLICY) =>
        isTourOfferable({ policy, now: NOW, state, revision: 1 });

    it('offers a tour with no state or with state for another revision', () => {
        expect(offerable(undefined)).toBe(true);
        expect(offerable(record({ status: 'completed', revision: 0 }))).toBe(true);
    });

    it('never re-offers a completed tour', () => {
        expect(offerable(record({ status: 'completed' }))).toBe(false);
    });

    it('re-offers an abandoned tour', () => {
        expect(offerable(record({ status: 'started' }))).toBe(true);
    });

    it('re-offers a dismissed tour only after the backoff, boundary inclusive', () => {
        expect(offerable(record({ status: 'dismissed', dismissedAt: NOW - 30 * DAY + 1 }))).toBe(false);
        expect(offerable(record({ status: 'dismissed', dismissedAt: NOW - 30 * DAY }))).toBe(true);
    });

    it('keeps a dismissal without a timestamp suppressed unless the backoff is zero', () => {
        expect(offerable(record({ status: 'dismissed' }))).toBe(false);
        expect(offerable(record({ status: 'dismissed', dismissedAt: NOW }), { ...DEFAULT_POLICY, dismissalBackoffDays: 0 })).toBe(true);
    });
});

describe('pickInterruption', () => {
    const alpha = makeTour('alpha', { trigger: { route: '/billing/*' } });
    const beta = makeTour('beta', { trigger: { route: '/billing' } });
    const manual = makeTour('manual');
    const modal = makeAnnouncement('news', { tier: 'modal' });
    const candidates = {
        route: '/billing',
        locales: [],
        tours: [beta, manual, alpha],
        stateOf: () => undefined,
        announcements: [modal],
        dismissedKeys: new Set<string>(),
    };

    it('picks the offerable matching route tour with the smallest key', () => {
        expect(pickInterruption(budget, candidates)).toEqual({ kind: 'tour', tour: alpha });
    });

    it('skips tours that are not offerable', () => {
        const stateOf = (tour: { key: string }) => (tour.key === 'alpha' ? record({ status: 'completed' }) : undefined);

        expect(pickInterruption(budget, { ...candidates, stateOf })).toEqual({ kind: 'tour', tour: beta });
    });

    it('ignores manual tours and non-matching routes', () => {
        const result = pickInterruption(budget, { ...candidates, tours: [manual], route: '/other' });

        expect(result).toEqual({ kind: 'announcement', announcement: modal });
    });

    it('offers no tour when the route is undefined', () => {
        expect(pickInterruption(budget, { ...candidates, route: undefined })?.kind).toBe('announcement');
    });

    it('offers the first unread undismissed modal when no tour fits', () => {
        const read = makeAnnouncement('read', { tier: 'modal' }, false);
        const dismissed = makeAnnouncement('dismissed', { tier: 'modal' });
        const feed = makeAnnouncement('feed');
        const result = pickInterruption(budget, {
            ...candidates,
            tours: [],
            announcements: [read, dismissed, feed, modal],
            dismissedKeys: new Set(['dismissed']),
        });

        expect(result).toEqual({ kind: 'announcement', announcement: modal });
    });

    it('offers nothing while the budget is closed', () => {
        expect(pickInterruption({ ...budget, lastAutoInterruptionAt: NOW }, candidates)).toBeNull();
    });
});
