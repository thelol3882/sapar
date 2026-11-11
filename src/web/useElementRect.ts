'use client';

import { useEffect, useState } from 'react';
import type { AnchorRect } from '../core';
import { measureElement } from './measure';

function sameRect(a: AnchorRect | null, b: AnchorRect | null): boolean {
    if (!a || !b) return a === b;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

interface Measured {
    element: HTMLElement;
    rect: AnchorRect | null;
}

/** Live viewport rect of `element`, re-measured at most once per animation frame; null when there is none or it is detached. */
export function useElementRect(element: HTMLElement | null): AnchorRect | null {
    // The rect is stored with the element it belongs to, so it can never be read for another one.
    const [measured, setMeasured] = useState<Measured | null>(null);

    useEffect(() => {
        if (!element) return;
        let frame = 0;

        const remeasure = (): void => {
            frame = 0;
            const rect = measureElement(element);
            setMeasured((previous) =>
                previous?.element === element && sameRect(previous.rect, rect) ? previous : { element, rect },
            );
        };
        const schedule = (): void => {
            if (frame === 0) frame = requestAnimationFrame(remeasure);
        };

        const observer = new ResizeObserver(schedule);
        observer.observe(element);
        // Capture: scroll does not bubble, and the anchor may sit in a nested scroller.
        window.addEventListener('scroll', schedule, { passive: true, capture: true });
        window.addEventListener('resize', schedule, { passive: true });
        remeasure();

        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
            cancelAnimationFrame(frame);
        };
    }, [element]);

    // Until the effect has measured a new element, measure it directly to avoid a frame without its rect.
    return measured?.element === element ? measured.rect : measureElement(element);
}
