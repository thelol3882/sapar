import type { AnchorHandle, PlatformAdapter, SessionStore } from '../core';
import { measureElement } from './measure';
import { getAnchorElement, waitForAnchor } from './registry';
import { browserSessionStore } from './stores';

export interface WebAdapterOptions {
    /** Push navigation, e.g. `router.push`. */
    navigate: (route: string) => void | Promise<void>;
    /** The route the host router currently reports. */
    currentRoute: () => string;
    /** Viewports narrower than this are compact. Default 768. */
    compactBreakpointPx?: number;
    session?: SessionStore;
}

const SCROLL_SETTLE_TIMEOUT_MS = 1000;
const SCROLL_STABLE_FRAMES = 2;

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// Smooth scrolling has no spec'd duration, so watch the element until it stops moving.
async function waitForScrollSettle(element: HTMLElement): Promise<void> {
    const deadline = performance.now() + SCROLL_SETTLE_TIMEOUT_MS;
    let previous = element.getBoundingClientRect();
    let stableFrames = 0;

    while (stableFrames < SCROLL_STABLE_FRAMES && element.isConnected && performance.now() < deadline) {
        await nextFrame();
        const current = element.getBoundingClientRect();
        stableFrames = current.top === previous.top && current.left === previous.left ? stableFrames + 1 : 0;
        previous = current;
    }
}

// The element is looked up on every call (and press is caught at the document) because React may remount it.
function createHandle(key: string): AnchorHandle {
    return {
        key,
        measure: async () => measureElement(getAnchorElement(key)),
        onPress(listener) {
            const handleClick = (event: MouseEvent): void => {
                const element = getAnchorElement(key);
                if (element && event.target instanceof Node && element.contains(event.target)) listener();
            };
            document.addEventListener('click', handleClick, true);
            return () => document.removeEventListener('click', handleClick, true);
        },
    };
}

export function createWebAdapter(options: WebAdapterOptions): PlatformAdapter {
    const { compactBreakpointPx = 768 } = options;

    return {
        platform: 'web',
        async resolveAnchor(key, { timeoutMs }) {
            const element = await waitForAnchor(key, timeoutMs);
            return element ? createHandle(key) : null;
        },
        async scrollIntoView(handle, { reducedMotion }) {
            const element = getAnchorElement(handle.key);
            if (!element) return;
            element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'instant' : 'smooth' });
            await waitForScrollSettle(element);
        },
        currentRoute: options.currentRoute,
        async navigate(route) {
            await options.navigate(route);
            await nextFrame();
        },
        prefersReducedMotion: () =>
            typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        isCompact: () => window.innerWidth < compactBreakpointPx,
        session: options.session ?? browserSessionStore(),
        now: Date.now,
    };
}
