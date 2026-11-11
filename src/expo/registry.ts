import type { ComponentRef } from 'react';
import type { View } from 'react-native';
import type { ScrollContainer } from './scrollContainer';

export type AnchorInstance = ComponentRef<typeof View>;

export interface RegisteredAnchor {
    instance: AnchorInstance;
    /** The scroll container the anchor lived in when it registered. */
    container: ScrollContainer | null;
}

const anchors = new Map<string, RegisteredAnchor>();
const waiters = new Map<string, Set<(anchor: RegisteredAnchor) => void>>();
const pressListeners = new Map<string, Set<() => void>>();

function addToSet<T>(sets: Map<string, Set<T>>, key: string, item: T): () => void {
    const set = sets.get(key) ?? new Set<T>();
    sets.set(key, set);
    set.add(item);
    return () => {
        set.delete(item);
        if (set.size === 0 && sets.get(key) === set) sets.delete(key);
    };
}

export function registerAnchor(key: string, anchor: RegisteredAnchor): () => void {
    anchors.set(key, anchor);
    [...(waiters.get(key) ?? [])].forEach((resolve) => resolve(anchor));

    return () => {
        if (anchors.get(key) === anchor) anchors.delete(key);
    };
}

export function getAnchor(key: string): RegisteredAnchor | null {
    return anchors.get(key) ?? null;
}

/** Resolves `null` on timeout. Woken by registration. */
export function waitForAnchor(key: string, timeoutMs: number): Promise<RegisteredAnchor | null> {
    const present = getAnchor(key);
    if (present) return Promise.resolve(present);

    return new Promise((resolve) => {
        const stopWaiting = addToSet(waiters, key, settle);
        const timer = setTimeout(() => settle(null), timeoutMs);

        function settle(anchor: RegisteredAnchor | null): void {
            clearTimeout(timer);
            stopWaiting();
            resolve(anchor);
        }
    });
}

export function subscribeToPress(key: string, listener: () => void): () => void {
    return addToSet(pressListeners, key, listener);
}

export function notifyPress(key: string): void {
    [...(pressListeners.get(key) ?? [])].forEach((listener) => listener());
}
