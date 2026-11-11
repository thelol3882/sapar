import type { AnchorRect } from '../core';
import type { AnchorInstance } from './registry';

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;

// A detached view reports a zero (or missing) size, which would read as a real anchor at the origin.
function toRect(x: number, y: number, width: number, height: number): AnchorRect | null {
    return width > 0 && height > 0 ? { x, y, width, height } : null;
}

export function measureInWindow(instance: Pick<AnchorInstance, 'measureInWindow'>): Promise<AnchorRect | null> {
    return new Promise((resolve) => {
        const onMeasured: MeasureCallback = (...measurement) => resolve(toRect(...measurement));
        instance.measureInWindow(onMeasured);
    });
}

/** Position of `instance` relative to `ancestor`, which must be one of its native ancestors. */
export function measureLayout(
    instance: Pick<AnchorInstance, 'measureLayout'>,
    ancestor: AnchorInstance,
): Promise<AnchorRect | null> {
    return new Promise((resolve) => {
        const onMeasured: MeasureCallback = (...measurement) => resolve(toRect(...measurement));
        instance.measureLayout(ancestor, onMeasured, () => resolve(null));
    });
}
