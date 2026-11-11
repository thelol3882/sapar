import type { KeyValueStore } from './types';

export function memoryStore(): KeyValueStore {
    const values = new Map<string, string>();
    return {
        get: (key) => values.get(key) ?? null,
        set: (key, value) => {
            values.set(key, value);
        },
        remove: (key) => {
            values.delete(key);
        },
    };
}
