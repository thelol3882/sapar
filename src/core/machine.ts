import {
    DEFAULT_ANCHOR_TIMEOUT_MS,
    DEFAULT_PRESENT_ANCHOR_TIMEOUT_MS,
    findMissingAnchors,
    requiresNavigation,
} from './steps';
import type { AnchorHandle, PlatformAdapter, ProgressInput, RunnerSnapshot, Tour, TourStatus, TourStep } from './types';

export interface TourMachineEvents {
    onProgress(input: ProgressInput): void;
    onError(error: unknown, context: string): void;
}

export interface TourMachineOptions {
    anchorTimeoutMs?: number;
    presentAnchorTimeoutMs?: number;
    locales?: readonly string[];
}

export interface TourMachine {
    subscribe(listener: () => void): () => void;
    /** Referentially stable until the state changes. */
    getSnapshot(): RunnerSnapshot;
    start(tour: Tour, options: { autoStarted: boolean }): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    skip(): void;
    finish(): void;
    /** Every method is a no-op afterwards. */
    destroy(): void;
}

const IDLE: RunnerSnapshot = { phase: 'idle', tour: null, index: 0, handle: null, skipped: [], autoStarted: false };

const noop = (): void => {};

type Direction = 1 | -1;

interface Arrival {
    kind: 'arrived';
    index: number;
    handle: AnchorHandle | null;
    missed: string[];
}

type Seek =
    | Arrival
    | { kind: 'aborted' }
    | { kind: 'exhausted' };

type Travel = 'landed' | 'exhausted' | 'stopped';

export function createTourMachine(
    adapter: PlatformAdapter,
    events: TourMachineEvents,
    options: TourMachineOptions = {},
): TourMachine {
    const anchorTimeoutMs = options.anchorTimeoutMs ?? DEFAULT_ANCHOR_TIMEOUT_MS;
    const presentAnchorTimeoutMs = options.presentAnchorTimeoutMs ?? DEFAULT_PRESENT_ANCHOR_TIMEOUT_MS;
    const locales = options.locales ?? [];
    const listeners = new Set<() => void>();
    let snapshot = IDLE;
    let destroyed = false;
    let stopListeningForPress = noop;
    // A transition captures its token before its first await and drops its result if another bumped it meanwhile.
    let transitionToken = 0;

    function beginTransition(): number {
        stopListeningForPress();
        stopListeningForPress = noop;
        return ++transitionToken;
    }

    function isCurrent(token: number): boolean {
        return !destroyed && token === transitionToken;
    }

    function commit(next: RunnerSnapshot): void {
        snapshot = next;
        stopListeningForPress();
        listenToCurrentStep();
        listeners.forEach((listener) => listener());
    }

    function listenToCurrentStep(): void {
        stopListeningForPress = listenForPress(snapshot);
    }

    function listenForPress({ phase, tour, index, handle }: RunnerSnapshot): () => void {
        if (phase !== 'running' || tour?.steps[index]?.advanceOn !== 'press' || !handle) return noop;
        return handle.onPress(() => void next());
    }

    // Right after a navigation the page is still loading; otherwise it is rendered and a missing anchor stays missing.
    async function resolveTarget(step: TourStep): Promise<{ handle: AnchorHandle | null } | null> {
        let timeoutMs = presentAnchorTimeoutMs;
        if (requiresNavigation(step, adapter, locales)) {
            await adapter.navigate(step.route);
            timeoutMs = anchorTimeoutMs;
        }
        if (step.anchor === undefined) return { handle: null };
        const handle = await adapter.resolveAnchor(step.anchor, { timeoutMs });
        return handle && { handle };
    }

    // Returns null when the transition was superseded.
    async function seek(token: number, tour: Tour, from: number, direction: Direction): Promise<Seek | null> {
        const missed: string[] = [];
        for (let index = from; ; index += direction) {
            const step = tour.steps[index];
            if (!step) return { kind: 'exhausted' };

            const target = await resolveTarget(step);
            if (!isCurrent(token)) return null;
            if (target) return { kind: 'arrived', index, handle: target.handle, missed };
            if (step.required) return { kind: 'aborted' };
            missed.push(step.key);
        }
    }

    async function land(token: number, tour: Tour, arrival: Arrival): Promise<Travel> {
        const { index, handle, missed } = arrival;
        if (handle) {
            await adapter.scrollIntoView(handle, { reducedMotion: adapter.prefersReducedMotion() });
            if (!isCurrent(token)) return 'stopped';
        }
        const missingLater = await findMissingAnchors(tour.steps.slice(index + 1), adapter, locales);
        if (!isCurrent(token)) return 'stopped';

        const known = new Set([...snapshot.skipped, ...missed]);
        const missingEarlier = tour.steps
            .slice(0, index)
            .filter((step) => known.has(step.key))
            .map((step) => step.key);
        const skipped = [...missingEarlier, ...missingLater];
        commit({ phase: 'running', tour, index, handle, skipped, autoStarted: snapshot.autoStarted });
        return 'landed';
    }

    // A required step that is missing on arrival closes the run without reporting, so the tour can be offered again.
    async function travel(token: number, tour: Tour, from: number, direction: Direction): Promise<Travel> {
        const found = await seek(token, tour, from, direction);
        if (!found) return 'stopped';
        if (found.kind === 'aborted') {
            commit(IDLE);
            return 'stopped';
        }
        return found.kind === 'exhausted' ? 'exhausted' : land(token, tour, found);
    }

    // Adapters report a missing anchor as null, so a rejection is an adapter bug: close the tour instead of hanging in 'preparing'.
    async function guarded(token: number, transition: () => Promise<void>): Promise<void> {
        try {
            await transition();
        } catch (error) {
            if (isCurrent(token)) commit(IDLE);
            events.onError(error, 'tour machine');
        }
    }

    async function start(tour: Tour, { autoStarted }: { autoStarted: boolean }): Promise<void> {
        if (destroyed) return;
        const token = beginTransition();
        commit({ ...IDLE, phase: 'preparing', tour, autoStarted });

        await guarded(token, async () => {
            const outcome = await travel(token, tour, 0, 1);
            if (outcome === 'exhausted') commit(IDLE);
            if (outcome === 'landed') {
                const { key, revision } = tour;
                events.onProgress({ key, revision, status: 'started', stepIndex: snapshot.index, autoStarted });
            }
        });
    }

    async function move(direction: Direction): Promise<void> {
        const { phase, tour, index } = snapshot;
        if (destroyed || phase !== 'running' || !tour) return;
        const token = beginTransition();

        await guarded(token, async () => {
            const outcome = await travel(token, tour, index + direction, direction);
            if (outcome !== 'exhausted') return;
            if (direction === 1) finish();
            else listenToCurrentStep();
        });
    }

    const next = (): Promise<void> => move(1);
    const previous = (): Promise<void> => move(-1);

    function end(status: Exclude<TourStatus, 'started'>): void {
        const { phase, tour, index, autoStarted } = snapshot;
        if (destroyed || phase !== 'running' || !tour) return;
        beginTransition();
        commit(IDLE);
        events.onProgress({ key: tour.key, revision: tour.revision, status, stepIndex: index, autoStarted });
    }

    const finish = (): void => end('completed');
    const skip = (): void => end('dismissed');

    function destroy(): void {
        if (destroyed) return;
        beginTransition();
        destroyed = true;
        listeners.clear();
    }

    return {
        subscribe(listener) {
            if (destroyed) return noop;
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot: () => snapshot,
        start,
        next,
        previous,
        skip,
        finish,
        destroy,
    };
}
