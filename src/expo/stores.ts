import type { KeyValueStore, SessionStore } from '../core';

/** The part of `@react-native-async-storage/async-storage` the tours use. */
export interface AsyncStorageLike {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
}

/** The part of a `react-native-mmkv` instance the tours use: `remove` since v4, `delete` before. */
export type MmkvLike = {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
} & ({ remove(key: string): void } | { delete(key: string): void });

export const asyncStorageStore = (storage: AsyncStorageLike): KeyValueStore => ({
    get: (key) => storage.getItem(key),
    set: (key, value) => storage.setItem(key, value),
    remove: (key) => storage.removeItem(key),
});

export const mmkvStore = (mmkv: MmkvLike): KeyValueStore => ({
    get: (key) => mmkv.getString(key) ?? null,
    set: (key, value) => mmkv.set(key, value),
    remove: (key) => ('remove' in mmkv ? mmkv.remove(key) : mmkv.delete(key)),
});

/** Lives as long as the JS runtime, which is what an app session is. */
export function appSessionStore(): SessionStore {
    const values = new Map<string, string>();
    return {
        get: (key) => values.get(key) ?? null,
        set: (key, value) => void values.set(key, value),
    };
}
