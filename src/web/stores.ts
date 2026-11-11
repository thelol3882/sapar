interface SyncStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}

// `resolve` is called per operation because merely touching `window.localStorage` can throw (blocked cookies, SSR).
function storageWithMemoryFallback(resolve: () => Storage): SyncStore {
    const memory = new Map<string, string>();

    function readStored(key: string): string | null {
        try {
            return resolve().getItem(key);
        } catch {
            return null;
        }
    }

    return {
        get: (key) => readStored(key) ?? memory.get(key) ?? null,
        set(key, value) {
            try {
                resolve().setItem(key, value);
            } catch {
                memory.set(key, value);
            }
        },
        remove(key) {
            memory.delete(key);
            try {
                resolve().removeItem(key);
            } catch {
                // Nothing persisted, nothing to remove.
            }
        },
    };
}

export const localStorageStore = (): SyncStore => storageWithMemoryFallback(() => window.localStorage);

export const browserSessionStore = (): SyncStore => storageWithMemoryFallback(() => window.sessionStorage);
