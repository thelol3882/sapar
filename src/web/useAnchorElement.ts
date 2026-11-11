'use client';

import { useSyncExternalStore } from 'react';
import { getAnchorElement, subscribeToAnchors } from './registry';

/** The element currently behind `key`; follows remounts. */
export function useAnchorElement(key: string | undefined): HTMLElement | null {
    return useSyncExternalStore(
        subscribeToAnchors,
        () => (key === undefined ? null : getAnchorElement(key)),
        () => null,
    );
}
