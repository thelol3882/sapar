import { resolveAnnouncement, resolveTour } from '../define';
import type { AnnouncementDefinition, TextLocale, TourDefinition } from '../define';
import { DEFAULT_POLICY, pickInterruption } from '../policy';
import type { InterruptionBudget, TourRecord } from '../policy';
import type {
    Announcement,
    Inbox,
    InterruptionPolicy,
    KeyValueStore,
    Platform,
    ProgressInput,
    Tour,
    SaparSource,
} from '../types';

export interface MemorySourceOptions {
    tours: readonly TourDefinition[];
    announcements?: readonly AnnouncementDefinition[];
    storage: KeyValueStore;
    locale?: string | (() => string);
    fallbackLocale?: string;
    /**
     * Applied to every resolved string at read time, after locale resolution. Lets definitions hold message keys
     * resolved by a stable function, so the source identity survives a locale switch.
     */
    translate?: (text: string) => string;
    policy?: Partial<InterruptionPolicy>;
    registeredAt?: Date | string | null;
    now?: () => number;
    namespace?: string;
}

interface StoredCell<T> {
    read(): Promise<T>;
    write(value: T): Promise<void>;
}

const isRecordMap = (value: unknown): value is Record<string, TourRecord> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseJson(raw: string | null): unknown {
    try {
        return raw === null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
}

// Corrupt or foreign data reads as empty and is overwritten by the next write.
function storedCell<T>(
    store: KeyValueStore,
    key: string,
    isValid: (value: unknown) => value is T,
    empty: () => T,
): StoredCell<T> {
    return {
        async read() {
            const value = parseJson(await store.get(key));
            return isValid(value) ? value : empty();
        },
        async write(value) {
            await store.set(key, JSON.stringify(value));
        },
    };
}

function translateTour(tour: Tour, translate: (text: string) => string): Tour {
    return {
        ...tour,
        title: translate(tour.title),
        steps: tour.steps.map((step) => ({ ...step, title: translate(step.title), body: translate(step.body) })),
    };
}

function translateAnnouncement(announcement: Announcement, translate: (text: string) => string): Announcement {
    const { cta } = announcement;
    return {
        ...announcement,
        title: translate(announcement.title),
        body: translate(announcement.body),
        ...(cta && { cta: { ...cta, label: translate(cta.label) } }),
    };
}

const recordId = (key: string, revision: number): string => `${key}@${revision}`;

function toEpochMs(value: Date | string | null | undefined): number | null {
    return value == null ? null : new Date(value).getTime();
}

function latestAutoStart(records: Record<string, TourRecord>): number | null {
    const starts = Object.values(records)
        .filter((record) => record.autoStarted)
        .map((record) => record.startedAt);
    return starts.length > 0 ? Math.max(...starts) : null;
}

export function memorySource(options: MemorySourceOptions): SaparSource {
    const { storage, namespace = 'sapar', fallbackLocale = 'en', translate = (text: string) => text } = options;
    const policy = { ...DEFAULT_POLICY, ...options.policy };
    const clock = options.now ?? Date.now;
    const registeredAt = toEpochMs(options.registeredAt);
    const announcementDefinitions = options.announcements ?? [];

    const tourRecords = storedCell<Record<string, TourRecord>>(storage, `${namespace}.tour-records`, isRecordMap, () => ({}));
    const seenKeys = storedCell<string[]>(storage, `${namespace}.seen`, isStringArray, () => []);
    const dismissedKeys = storedCell<string[]>(storage, `${namespace}.dismissed`, isStringArray, () => []);

    // Every operation is a read-modify-write on an async store; running them one at a time prevents lost updates.
    let queue: Promise<unknown> = Promise.resolve();
    function serialized<T>(task: () => Promise<T>): Promise<T> {
        const result = queue.then(task);
        queue = result.catch(() => undefined);
        return result;
    }

    function textLocale(): TextLocale {
        const { locale = fallbackLocale } = options;
        return { locale: typeof locale === 'function' ? locale() : locale, fallbackLocale };
    }

    const readTour = (definition: TourDefinition): Tour => translateTour(resolveTour(definition, textLocale()), translate);

    function findTour(key: string): TourDefinition {
        const tour = options.tours.find((candidate) => candidate.key === key);
        if (!tour) throw new Error(`No tour with key "${key}".`);
        return tour;
    }

    const isKnownAnnouncement = (key: string): boolean =>
        announcementDefinitions.some((announcement) => announcement.key === key);

    function requireAnnouncement(key: string): void {
        if (!isKnownAnnouncement(key)) throw new Error(`No announcement with key "${key}".`);
    }

    async function publishedAnnouncements(now: number): Promise<Announcement[]> {
        const seen = new Set(await seenKeys.read());
        const locale = textLocale();
        return announcementDefinitions
            .filter((announcement) => Date.parse(announcement.publishedAt) <= now)
            .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.key < b.key ? -1 : 1))
            .map((announcement) =>
                translateAnnouncement(resolveAnnouncement(announcement, locale, !seen.has(announcement.key)), translate),
            );
    }

    async function addKeys(cell: StoredCell<string[]>, keys: readonly string[]): Promise<void> {
        const merged = new Set([...(await cell.read()), ...keys]);
        await cell.write([...merged]);
    }

    async function getInbox({ route, platform }: { route?: string; platform: Platform }): Promise<Inbox> {
        const now = clock();
        const records = await tourRecords.read();
        const items = await publishedAnnouncements(now);
        const budget: InterruptionBudget = { policy, now, registeredAt, lastAutoInterruptionAt: latestAutoStart(records) };

        const interruption = pickInterruption(budget, {
            route,
            // The controller sends an already-normalized route.
            locales: [],
            tours: options.tours.filter((tour) => tour.platforms?.includes(platform) ?? true).map(readTour),
            stateOf: (tour) => records[recordId(tour.key, tour.revision)],
            announcements: items,
            dismissedKeys: new Set(await dismissedKeys.read()),
        });
        return {
            unreadCount: items.filter((item) => item.unread && item.tier !== 'silent').length,
            items,
            interruption,
        };
    }

    async function recordProgress({ key, revision, status, stepIndex, autoStarted }: ProgressInput): Promise<void> {
        findTour(key);
        const records = await tourRecords.read();
        const id = recordId(key, revision);
        const existing = records[id];
        const now = clock();

        // Same rules as the backend's record_tour_progress: completion and step index never regress, auto-start is sticky.
        const finalStatus = existing?.status === 'completed' ? 'completed' : status;
        records[id] = {
            status: finalStatus,
            revision,
            lastStepIndex: Math.max(stepIndex, existing?.lastStepIndex ?? 0),
            startedAt: existing?.startedAt ?? now,
            dismissedAt: existing?.dismissedAt ?? (finalStatus === 'dismissed' ? now : null),
            autoStarted: autoStarted || (existing?.autoStarted ?? false),
        };
        await tourRecords.write(records);
    }

    async function markSeen(keys: string[]): Promise<void> {
        await addKeys(seenKeys, keys.filter(isKnownAnnouncement));
    }

    return {
        getInbox: (query) => serialized(() => getInbox(query)),
        getTour: (key) =>
            serialized(async () => {
                const tour = options.tours.find((candidate) => candidate.key === key);
                return tour ? readTour(tour) : null;
            }),
        recordProgress: (input) => serialized(() => recordProgress(input)),
        markSeen: (keys) => serialized(() => markSeen(keys)),
        dismiss: (key) =>
            serialized(async () => {
                requireAnnouncement(key);
                await addKeys(seenKeys, [key]);
                await addKeys(dismissedKeys, [key]);
            }),
        recordClick: (key) =>
            serialized(async () => {
                requireAnnouncement(key);
                await addKeys(seenKeys, [key]);
            }),
        listAnnouncements: () => serialized(() => publishedAnnouncements(clock())),
    };
}
