import type { AnchorHandle, AnchorRect, Platform, PlatformAdapter } from './types';

export interface TestAnchorHandle extends AnchorHandle {
    press(): void;
    pressListenerCount(): number;
}

export interface TestAdapterOptions {
    platform?: Platform;
    /** Anchors that exist from the start. */
    anchors?: readonly string[];
    /** Anchors that resolve only once `showAnchor` is called, or to null on timeout. */
    delayedAnchors?: readonly string[];
    route?: string;
    now?: number;
    reducedMotion?: boolean;
    compact?: boolean;
}

export interface TestAdapter extends PlatformAdapter {
    anchors: Map<string, TestAnchorHandle>;
    navigations: string[];
    scrolls: Array<{ handle: AnchorHandle; reducedMotion: boolean }>;
    resolveRequests: Array<{ key: string; timeoutMs: number }>;
    sessionValues: Map<string, string>;
    showAnchor(key: string): TestAnchorHandle;
    hideAnchor(key: string): void;
    setRoute(route: string): void;
    advanceTime(ms: number): void;
}

const RECT: AnchorRect = { x: 0, y: 0, width: 100, height: 40 };

function createAnchorHandle(key: string): TestAnchorHandle {
    const listeners = new Set<() => void>();
    return {
        key,
        measure: async () => RECT,
        onPress(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        press: () => [...listeners].forEach((listener) => listener()),
        pressListenerCount: () => listeners.size,
    };
}

export function createTestAdapter(options: TestAdapterOptions = {}): TestAdapter {
    const anchors = new Map<string, TestAnchorHandle>();
    const waiting = new Map<string, Array<(handle: TestAnchorHandle) => void>>();
    const delayed = new Set(options.delayedAnchors);
    const sessionValues = new Map<string, string>();
    let route = options.route ?? '/';
    let now = options.now ?? 0;

    function showAnchor(key: string): TestAnchorHandle {
        const handle = anchors.get(key) ?? createAnchorHandle(key);
        anchors.set(key, handle);
        waiting.get(key)?.forEach((resolve) => resolve(handle));
        waiting.delete(key);
        return handle;
    }

    function waitForAnchor(key: string, timeoutMs: number): Promise<TestAnchorHandle | null> {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), timeoutMs);
            waiting.set(key, [
                ...(waiting.get(key) ?? []),
                (handle) => {
                    clearTimeout(timer);
                    resolve(handle);
                },
            ]);
        });
    }

    options.anchors?.forEach(showAnchor);

    return {
        platform: options.platform ?? 'web',
        anchors,
        navigations: [],
        scrolls: [],
        resolveRequests: [],
        sessionValues,
        showAnchor,
        hideAnchor: (key) => void anchors.delete(key),
        setRoute: (next) => {
            route = next;
        },
        advanceTime: (ms) => {
            now += ms;
        },
        async resolveAnchor(key, { timeoutMs }) {
            this.resolveRequests.push({ key, timeoutMs });
            const present = anchors.get(key);
            if (present) return present;
            return delayed.has(key) ? waitForAnchor(key, timeoutMs) : null;
        },
        async scrollIntoView(handle, { reducedMotion }) {
            this.scrolls.push({ handle, reducedMotion });
        },
        currentRoute: () => route,
        async navigate(destination) {
            this.navigations.push(destination);
            route = destination;
        },
        prefersReducedMotion: () => options.reducedMotion ?? false,
        isCompact: () => options.compact ?? false,
        session: {
            get: (key) => sessionValues.get(key) ?? null,
            set: (key, value) => void sessionValues.set(key, value),
        },
        now: () => now,
    };
}
