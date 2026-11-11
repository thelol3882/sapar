import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { AnchorHandle, AnchorRect } from '../core';
import { getAnchor } from './registry';

// Native layout settles after the step is shown (scroll ends, screens finish transitioning), so measure a few more times.
const SETTLE_POLL_COUNT = 5;
const SETTLE_POLL_INTERVAL_MS = 120;

const sameRect = (a: AnchorRect | null, b: AnchorRect | null): boolean =>
    a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

interface Measured {
    handle: AnchorHandle;
    rect: AnchorRect | null;
}

/** Window rect of the anchor; null without a handle or while it cannot be measured. Re-measures when the window resizes or its scroll container scrolls. */
export function useAnchorRect(handle: AnchorHandle | null): AnchorRect | null {
    const { width, height } = useWindowDimensions();
    const [measured, setMeasured] = useState<Measured | null>(null);

    useEffect(() => {
        if (!handle) {
            setMeasured(null);
            return;
        }
        let cancelled = false;

        async function measure(current: AnchorHandle): Promise<void> {
            const rect = await current.measure();
            if (cancelled) return;
            setMeasured((previous) =>
                previous?.handle === current && sameRect(previous.rect, rect) ? previous : { handle: current, rect },
            );
        }

        void measure(handle);
        const stopFollowingScroll = getAnchor(handle.key)?.container?.subscribeToScroll(() => void measure(handle));
        let polls = 0;
        const timer = setInterval(() => {
            void measure(handle);
            if (++polls >= SETTLE_POLL_COUNT) clearInterval(timer);
        }, SETTLE_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
            stopFollowingScroll?.();
        };
    }, [handle, width, height]);

    return handle && measured?.handle === handle ? measured.rect : null;
}
