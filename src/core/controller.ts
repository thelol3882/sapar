import { hasSpentSessionInterruption, spendSessionInterruption } from './capping';
import { createTourMachine } from './machine';
import { normalizeRoute } from './routes';
import {
    DEFAULT_ANCHOR_TIMEOUT_MS,
    DEFAULT_AUTO_START_TIMEOUT_MS,
    DEFAULT_PRESENT_ANCHOR_TIMEOUT_MS,
    requiresNavigation,
} from './steps';
import type {
    Inbox,
    Interruption,
    ProgressInput,
    Tour,
    SaparController,
    SaparControllerOptions,
    SaparSnapshot,
} from './types';

function withUnread(inbox: Inbox, keys: ReadonlySet<string>, unread: boolean): Inbox {
    const flipped = inbox.items.filter((item) => keys.has(item.key) && item.unread !== unread);
    if (flipped.length === 0) return inbox;

    const countDelta = flipped.filter((item) => item.tier !== 'silent').length * (unread ? 1 : -1);
    return {
        ...inbox,
        unreadCount: inbox.unreadCount + countDelta,
        items: inbox.items.map((item) => (flipped.includes(item) ? { ...item, unread } : item)),
    };
}

function withoutInterruption(inbox: Inbox, announcementKeys: readonly string[]): Inbox {
    const { interruption } = inbox;
    const matches = interruption?.kind === 'announcement' && announcementKeys.includes(interruption.announcement.key);
    return matches ? { ...inbox, interruption: null } : inbox;
}

export function createSaparController(options: SaparControllerOptions): SaparController {
    const { source, adapter, locales = [], sessionCap = true } = options;
    const autoStartTimeoutMs = options.autoStartTimeoutMs ?? DEFAULT_AUTO_START_TIMEOUT_MS;
    const onError = options.onError ?? ((error, context) => console.error(`[sapar] ${context}`, error));
    const listeners = new Set<() => void>();
    const autoStartedKeys = new Set<string>();
    let route: string | undefined;
    let inboxRequestId = 0;
    let surfacedAnnouncementKey: string | null = null;
    let destroyed = false;

    const machine = createTourMachine(
        adapter,
        { onProgress: handleProgress, onError },
        {
            anchorTimeoutMs: options.anchorTimeoutMs ?? DEFAULT_ANCHOR_TIMEOUT_MS,
            presentAnchorTimeoutMs: options.presentAnchorTimeoutMs ?? DEFAULT_PRESENT_ANCHOR_TIMEOUT_MS,
            locales,
        },
    );
    let snapshot: SaparSnapshot = { inbox: null, inboxStatus: 'idle', runner: machine.getSnapshot() };
    machine.subscribe(() => update({ runner: machine.getSnapshot() }));

    function update(patch: Partial<SaparSnapshot>): void {
        const changed = (Object.keys(patch) as Array<keyof SaparSnapshot>).some((name) => patch[name] !== snapshot[name]);
        if (!changed) return;
        snapshot = { ...snapshot, ...patch };
        listeners.forEach((listener) => listener());
    }

    // Session cap: once the session's one slot is spent nothing more is offered, except the announcement
    // already on screen. An announcement spends the slot when it first surfaces; a tour when it actually starts.
    function applySessionCap(interruption: Interruption | null): Interruption | null {
        if (!interruption || !sessionCap) return interruption;
        const isSurfaced = interruption.kind === 'announcement' && interruption.announcement.key === surfacedAnnouncementKey;
        if (isSurfaced) return interruption;
        if (hasSpentSessionInterruption(adapter)) return null;

        if (interruption.kind === 'announcement') {
            surfacedAnnouncementKey = interruption.announcement.key;
            spendSessionInterruption(adapter);
        }
        return interruption;
    }

    // The host renders the first anchor only once its page has loaded, so its arrival means "ready".
    async function waitForPage(tour: Tour): Promise<boolean> {
        const first = tour.steps.find((step) => step.anchor !== undefined);
        if (first?.anchor === undefined || requiresNavigation(first, adapter, locales)) return true;
        return (await adapter.resolveAnchor(first.anchor, { timeoutMs: autoStartTimeoutMs })) !== null;
    }

    async function autoStart(tour: Tour): Promise<void> {
        if (snapshot.runner.phase !== 'idle' || autoStartedKeys.has(tour.key)) return;
        autoStartedKeys.add(tour.key);

        const ready = await waitForPage(tour).catch((error: unknown) => {
            onError(error, 'autoStart');
            return false;
        });
        if (!ready || destroyed || snapshot.runner.phase !== 'idle') {
            autoStartedKeys.delete(tour.key);
            return;
        }
        await machine.start(tour, { autoStarted: true });
    }

    function handleProgress(input: ProgressInput): void {
        if (input.status === 'started' && input.autoStarted && sessionCap) spendSessionInterruption(adapter);
        void reportProgress(input);
    }

    async function reportProgress(input: ProgressInput): Promise<void> {
        try {
            await source.recordProgress(input);
        } catch (error) {
            onError(error, 'progress');
            return;
        }
        if (input.status !== 'started') await refresh();
    }

    async function refresh(): Promise<void> {
        if (destroyed) return;
        const requestId = ++inboxRequestId;
        const query = { route: route === undefined ? undefined : normalizeRoute(route, locales), platform: adapter.platform };
        if (!snapshot.inbox) update({ inboxStatus: 'loading' });

        try {
            const inbox = await source.getInbox(query);
            if (destroyed || requestId !== inboxRequestId) return;
            const interruption = applySessionCap(inbox.interruption);
            update({ inbox: { ...inbox, interruption }, inboxStatus: 'ready' });
            if (interruption?.kind === 'tour') void autoStart(interruption.tour);
        } catch (error) {
            if (destroyed || requestId !== inboxRequestId) return;
            update({ inboxStatus: 'error' });
            onError(error, 'inbox');
        }
    }

    async function loadTour(tourOrKey: Tour | string): Promise<Tour | null> {
        if (typeof tourOrKey !== 'string') return tourOrKey;
        const tour = await source.getTour(tourOrKey);
        if (!tour) onError(new Error(`No tour with key "${tourOrKey}".`), 'startTour');
        return tour;
    }

    async function startTour(tourOrKey: Tour | string): Promise<void> {
        try {
            const tour = await loadTour(tourOrKey);
            if (tour && !destroyed) await machine.start(tour, { autoStarted: false });
        } catch (error) {
            onError(error, 'startTour');
        }
    }

    async function markSeen(keys: string[]): Promise<void> {
        const flippedKeys = new Set(
            snapshot.inbox?.items.filter((item) => item.unread && keys.includes(item.key)).map((item) => item.key),
        );
        if (snapshot.inbox) update({ inbox: withoutInterruption(withUnread(snapshot.inbox, flippedKeys, false), keys) });
        try {
            await source.markSeen(keys);
        } catch (error) {
            if (snapshot.inbox) update({ inbox: withUnread(snapshot.inbox, flippedKeys, true) });
            onError(error, 'markSeen');
        }
    }

    async function dismiss(key: string): Promise<void> {
        if (snapshot.inbox) update({ inbox: withoutInterruption(snapshot.inbox, [key]) });
        try {
            await source.dismiss(key);
        } catch (error) {
            onError(error, 'dismiss');
            return;
        }
        await refresh();
    }

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot: () => snapshot,
        setRoute(nextRoute) {
            route = nextRoute;
            void refresh();
        },
        refresh,
        startTour,
        next: () => machine.next(),
        previous: () => machine.previous(),
        skip: () => machine.skip(),
        markSeen,
        dismiss,
        recordClick(key) {
            source.recordClick(key).catch((error: unknown) => onError(error, 'recordClick'));
        },
        destroy() {
            destroyed = true;
            machine.destroy();
            listeners.clear();
        },
    };
}
