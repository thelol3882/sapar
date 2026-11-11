// The contract every layer builds on. Pure TypeScript: no React, no DOM.

export type Platform = 'web' | 'native';
export type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right';
export type AnnouncementTier = 'silent' | 'feed' | 'modal';
export type TourStatus = 'started' | 'completed' | 'dismissed';

/** `'manual'` starts only on request; `{ route }` may auto-start where the pattern matches. */
export type TourTrigger = 'manual' | { route: string };

/** Plain text, or a per-locale map resolved by the source. */
export type LocalizedText = string | Readonly<Record<string, string>>;

export interface TourStep {
    key: string;
    /** Absent means a centered step with no spotlight. */
    anchor?: string;
    /** Route the anchor lives on; the runner navigates there first. */
    route?: string;
    title: string;
    body: string;
    placement: Placement;
    padding: number;
    /** A missing anchor skips the step unless this is set, which aborts the tour when the runner reaches it. */
    required: boolean;
    /** `'press'` advances when the user presses the anchored element itself. */
    advanceOn: 'next' | 'press';
}

export interface Tour {
    key: string;
    revision: number;
    title: string;
    trigger: TourTrigger;
    steps: TourStep[];
}

export interface Announcement {
    key: string;
    tier: AnnouncementTier;
    title: string;
    body: string;
    imageUrl?: string;
    cta?: { label: string; url: string };
    /** ISO 8601. */
    publishedAt: string | null;
    tourKey?: string;
    unread: boolean;
}

export type Interruption =
    | { kind: 'tour'; tour: Tour }
    | { kind: 'announcement'; announcement: Announcement };

export interface Inbox {
    /** Unread non-silent announcements. */
    unreadCount: number;
    items: Announcement[];
    /** At most one unbidden thing to show, already filtered by the source's policy. */
    interruption: Interruption | null;
}

export interface ProgressInput {
    key: string;
    revision: number;
    status: TourStatus;
    stepIndex: number;
    autoStarted: boolean;
}

/**
 * Where tours, announcements and per-user state come from.
 * Implementations: `memorySource` (definitions in code, state in storage),
 * `httpSource` (the Django/FastAPI backend over fetch), `createSaparRtk` (same backend through RTK Query).
 */
export interface SaparSource {
    getInbox(query: { route?: string; platform: Platform }): Promise<Inbox>;
    getTour(key: string): Promise<Tour | null>;
    recordProgress(input: ProgressInput): Promise<void>;
    markSeen(keys: string[]): Promise<void>;
    dismiss(key: string): Promise<void>;
    recordClick(key: string): Promise<void>;
    listAnnouncements(): Promise<Announcement[]>;
}

/** Possibly-async key-value storage: localStorage, AsyncStorage, MMKV, memory. */
export interface KeyValueStore {
    get(key: string): string | null | Promise<string | null>;
    set(key: string, value: string): void | Promise<void>;
    remove(key: string): void | Promise<void>;
}

/** Synchronous per-session storage for the client-side interruption cap. */
export interface SessionStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
}

export interface AnchorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AnchorHandle {
    key: string;
    /** Async because native measurement is; live because the element moves. */
    measure(): Promise<AnchorRect | null>;
    /** Resolves on the next press of the anchored element. Returns an unsubscribe. */
    onPress(listener: () => void): () => void;
}

/** Everything platform-shaped. The web implementation lives in `/web`, a native one would sit beside it. */
export interface PlatformAdapter {
    platform: Platform;
    /** Resolves `null` on timeout. Must never reject for a missing anchor. */
    resolveAnchor(key: string, options: { timeoutMs: number }): Promise<AnchorHandle | null>;
    scrollIntoView(handle: AnchorHandle, options: { reducedMotion: boolean }): Promise<void>;
    /** Raw route in the host router's spelling; the controller normalizes it. */
    currentRoute(): string;
    /** Resolves once the destination has rendered. */
    navigate(route: string): Promise<void>;
    prefersReducedMotion(): boolean;
    isCompact(): boolean;
    session: SessionStore;
    now(): number;
}

export type RunnerPhase = 'idle' | 'preparing' | 'running';

export interface RunnerSnapshot {
    phase: RunnerPhase;
    tour: Tour | null;
    /** Index into `tour.steps` of the step being shown. */
    index: number;
    /** The current step's anchor, or null for a centered step. */
    handle: AnchorHandle | null;
    /** Keys of the steps whose anchor is missing right now. An estimate: the runner still tries each on arrival. */
    skipped: readonly string[];
    autoStarted: boolean;
}

export type InboxStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SaparSnapshot {
    inbox: Inbox | null;
    inboxStatus: InboxStatus;
    runner: RunnerSnapshot;
}

export interface SaparControllerOptions {
    source: SaparSource;
    adapter: PlatformAdapter;
    /** Locale prefixes stripped from routes (`/ru/billing` -> `/billing`). Must match the backend. */
    locales?: readonly string[];
    /** How long to wait for an anchor right after navigating, while the page loads. Default 3000. */
    anchorTimeoutMs?: number;
    /** How long to wait for an anchor on a page that is already rendered. Default 300. */
    presentAnchorTimeoutMs?: number;
    /** How long an auto-started tour waits for its first anchor before giving up quietly. Default 10000. */
    autoStartTimeoutMs?: number;
    /** At most one unbidden interruption per session on top of the source's policy. Default true. */
    sessionCap?: boolean;
    /** Called for swallowed errors (failed progress writes, adapter bugs). Default `console.error`. */
    onError?: (error: unknown, context: string) => void;
}

/** Framework-free owner of the inbox, the runner and every behaviour rule. React only binds to it. */
export interface SaparController {
    subscribe(listener: () => void): () => void;
    /** Referentially stable until state changes, for `useSyncExternalStore`. */
    getSnapshot(): SaparSnapshot;

    /** Reports the current route; refetches the inbox and may auto-start the offered interruption. `undefined` opts out of route triggers. */
    setRoute(route: string | undefined): void;
    refresh(): Promise<void>;

    /** A tour the user asked for: never capped, reported with `autoStarted: false`. */
    startTour(tourOrKey: Tour | string): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    skip(): void;

    /** Optimistically clears unread state, rolls back if the source rejects. */
    markSeen(keys: string[]): Promise<void>;
    dismiss(key: string): Promise<void>;
    recordClick(key: string): void;

    destroy(): void;
}

/** Local interruption policy, used by `memorySource`. Mirrors the backend's settings and defaults. */
export interface InterruptionPolicy {
    /** No interruptions for accounts younger than this. Default 3. */
    newUserGraceDays: number;
    /** Minimum gap between auto interruptions. Default 24. */
    cooldownHours: number;
    /** A dismissed tour is re-offered after this long; 0 means immediately. Default 30. */
    dismissalBackoffDays: number;
}
