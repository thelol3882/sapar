export const ANCHOR_ATTRIBUTE = 'data-sapar';

const elements = new Map<string, HTMLElement>();
const waiters = new Map<string, Set<(element: HTMLElement | null) => void>>();
const listeners = new Set<() => void>();

const isDevelopment = (): boolean => typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

function notifyListeners(): void {
    listeners.forEach((listener) => listener());
}

export function registerAnchor(key: string, element: HTMLElement): () => void {
    const existing = elements.get(key);
    // A disconnected predecessor is just a remount whose cleanup has not run yet.
    if (existing && existing !== element && existing.isConnected && isDevelopment()) {
        console.warn(`[sapar] Duplicate anchor "${key}": the most recently registered element wins. Keys must be unique.`);
    }

    elements.set(key, element);
    waiters.get(key)?.forEach((resolve) => resolve(element));
    notifyListeners();

    return () => {
        if (elements.get(key) !== element) return;
        elements.delete(key);
        notifyListeners();
    };
}

export function getAnchorElement(key: string): HTMLElement | null {
    const registered = elements.get(key);
    if (registered?.isConnected) return registered;
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>(`[${ANCHOR_ATTRIBUTE}="${CSS.escape(key)}"]`);
}

/** Resolves `null` on timeout. Woken by registration, or by a DOM mutation for plain `data-sapar` markup. */
export function waitForAnchor(key: string, timeoutMs: number): Promise<HTMLElement | null> {
    const present = getAnchorElement(key);
    if (present) return Promise.resolve(present);

    return new Promise((resolve) => {
        const pending = waiters.get(key) ?? new Set();
        waiters.set(key, pending);

        const observer = new MutationObserver(() => {
            const element = getAnchorElement(key);
            if (element) settle(element);
        });
        const timer = setTimeout(() => settle(null), timeoutMs);

        function settle(element: HTMLElement | null): void {
            clearTimeout(timer);
            observer.disconnect();
            pending.delete(settle);
            if (pending.size === 0 && waiters.get(key) === pending) waiters.delete(key);
            resolve(element);
        }

        pending.add(settle);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [ANCHOR_ATTRIBUTE] });
    });
}

// Registration only reports hook anchors, and a hook's cleanup runs before React removes its node, so a removed
// anchor (either spelling) is noticed from the DOM itself.
let removalObserver: MutationObserver | null = null;

function watchDocument(): void {
    removalObserver = new MutationObserver(notifyListeners);
    removalObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [ANCHOR_ATTRIBUTE],
    });
}

function stopWatchingDocument(): void {
    removalObserver?.disconnect();
    removalObserver = null;
}

export function subscribeToAnchors(listener: () => void): () => void {
    if (listeners.size === 0) watchDocument();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopWatchingDocument();
    };
}
