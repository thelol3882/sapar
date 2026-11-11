'use client';

import { useSyncExternalStore } from 'react';
import { useSaparAdapter } from '../react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(listener: () => void): () => void {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
}

function subscribeToResize(listener: () => void): () => void {
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
}

export function useReducedMotion(): boolean {
    const adapter = useSaparAdapter();
    return useSyncExternalStore(
        subscribeToReducedMotion,
        () => adapter?.prefersReducedMotion() ?? false,
        () => false,
    );
}

export function useIsCompact(): boolean {
    const adapter = useSaparAdapter();
    return useSyncExternalStore(
        subscribeToResize,
        () => adapter?.isCompact() ?? false,
        () => false,
    );
}
