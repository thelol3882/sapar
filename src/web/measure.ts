import type { AnchorRect } from '../core';

export function measureElement(element: HTMLElement | null): AnchorRect | null {
    // A detached element reports an all-zero rect, which would read as a real anchor at the top-left corner.
    if (!element?.isConnected) return null;
    const { left, top, width, height } = element.getBoundingClientRect();
    return { x: left, y: top, width, height };
}
