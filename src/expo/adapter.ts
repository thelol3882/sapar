import { AccessibilityInfo, Dimensions } from 'react-native';
import type { AnchorHandle, PlatformAdapter, SessionStore } from '../core';
import { measureInWindow } from './measure';
import { getAnchor, subscribeToPress, waitForAnchor } from './registry';
import { scrollAnchorIntoView } from './scrollIntoView';
import { appSessionStore } from './stores';

export interface ExpoAdapterOptions {
    /** Push navigation, e.g. `router.push`. */
    navigate: (route: string) => void | Promise<void>;
    /** The route the host router currently reports. */
    currentRoute: () => string;
    /** With `presentation="auto"`, windows narrower than this always get the bottom sheet. Default 0: never. */
    compactBreakpointPx?: number;
    session?: SessionStore;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// The adapter method is synchronous, so the platform's async answer is cached and kept fresh by its event.
function trackReducedMotion(): () => boolean {
    let enabled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
        enabled = value;
    });
    AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
        enabled = value;
    });
    return () => enabled;
}

// The view is looked up on every call because it can remount under the same key.
function createHandle(key: string): AnchorHandle {
    return {
        key,
        measure: async () => {
            const anchor = getAnchor(key);
            return anchor ? measureInWindow(anchor.instance) : null;
        },
        onPress: (listener) => subscribeToPress(key, listener),
    };
}

export function createExpoAdapter(options: ExpoAdapterOptions): PlatformAdapter {
    const { compactBreakpointPx = 0 } = options;

    return {
        platform: 'native',
        async resolveAnchor(key, { timeoutMs }) {
            const anchor = await waitForAnchor(key, timeoutMs);
            return anchor ? createHandle(key) : null;
        },
        async scrollIntoView(handle, { reducedMotion }) {
            const anchor = getAnchor(handle.key);
            if (anchor) await scrollAnchorIntoView(anchor, reducedMotion);
        },
        currentRoute: options.currentRoute,
        async navigate(route) {
            await options.navigate(route);
            await nextFrame();
        },
        prefersReducedMotion: trackReducedMotion(),
        isCompact: () => Dimensions.get('window').width < compactBreakpointPx,
        session: options.session ?? appSessionStore(),
        now: Date.now,
    };
}
