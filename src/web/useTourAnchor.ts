'use client';

import { useCallback, type RefCallback } from 'react';
import { ANCHOR_ATTRIBUTE, registerAnchor } from './registry';

export interface TourAnchorProps<K extends string, E extends HTMLElement> {
    ref: RefCallback<E>;
    [ANCHOR_ATTRIBUTE]: K;
}

/** Spread the result onto the element a tour step points at: `<button {...useTourAnchor('billing.upgrade')} />`. */
export function useTourAnchor<K extends string = string, E extends HTMLElement = HTMLElement>(
    key: K,
): TourAnchorProps<K, E> {
    const ref = useCallback<RefCallback<E>>((node) => (node ? registerAnchor(key, node) : undefined), [key]);
    return { ref, [ANCHOR_ATTRIBUTE]: key };
}
