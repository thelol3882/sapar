import { routeMatches } from './routes';
import type { Announcement, Interruption, InterruptionPolicy, Tour, TourStatus } from './types';

export const DEFAULT_POLICY: InterruptionPolicy = {
    newUserGraceDays: 3,
    cooldownHours: 24,
    dismissalBackoffDays: 30,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface TourRecord {
    status: TourStatus;
    revision: number;
    lastStepIndex: number;
    /** Epoch ms of the first report for this (tour, revision). */
    startedAt: number;
    dismissedAt: number | null;
    /** Sticky: once a run counted as an automatic interruption it stays one. */
    autoStarted: boolean;
}

export interface InterruptionBudget {
    policy: InterruptionPolicy;
    now: number;
    registeredAt: number | null;
    lastAutoInterruptionAt: number | null;
}

function isWithin(now: number, since: number | null, windowMs: number): boolean {
    return since !== null && now - since < windowMs;
}

export function interruptionsAllowed({ policy, now, registeredAt, lastAutoInterruptionAt }: InterruptionBudget): boolean {
    const inGrace = policy.newUserGraceDays > 0 && isWithin(now, registeredAt, policy.newUserGraceDays * DAY_MS);
    const coolingDown = policy.cooldownHours > 0 && isWithin(now, lastAutoInterruptionAt, policy.cooldownHours * HOUR_MS);
    return !inGrace && !coolingDown;
}

export function isTourOfferable({ policy, now, state, revision }: {
    policy: InterruptionPolicy;
    now: number;
    state: TourRecord | undefined;
    revision: number;
}): boolean {
    if (!state || state.revision !== revision) return true;
    if (state.status === 'completed') return false;
    if (state.status === 'started') return true;
    if (policy.dismissalBackoffDays <= 0) return true;
    return state.dismissedAt !== null && !isWithin(now, state.dismissedAt, policy.dismissalBackoffDays * DAY_MS);
}

export interface InterruptionCandidates {
    /** `undefined` means the host sent no route, which opts out of route triggers. */
    route: string | undefined;
    locales: readonly string[];
    tours: readonly Tour[];
    stateOf(tour: Tour): TourRecord | undefined;
    announcements: readonly Announcement[];
    dismissedKeys: ReadonlySet<string>;
}

function pickTour(budget: InterruptionBudget, { route, locales, tours, stateOf }: InterruptionCandidates): Tour | undefined {
    if (route === undefined) return undefined;
    return tours
        .filter(
            (tour) =>
                typeof tour.trigger === 'object' &&
                routeMatches(tour.trigger.route, route, locales) &&
                isTourOfferable({ ...budget, state: stateOf(tour), revision: tour.revision }),
        )
        .sort((a, b) => (a.key < b.key ? -1 : 1))[0];
}

// A tour beats a modal announcement: the announcement stays in the feed, the tour only fits where the user is now.
export function pickInterruption(budget: InterruptionBudget, candidates: InterruptionCandidates): Interruption | null {
    if (!interruptionsAllowed(budget)) return null;

    const tour = pickTour(budget, candidates);
    if (tour) return { kind: 'tour', tour };

    const announcement = candidates.announcements.find(
        (item) => item.tier === 'modal' && item.unread && !candidates.dismissedKeys.has(item.key),
    );
    return announcement ? { kind: 'announcement', announcement } : null;
}
