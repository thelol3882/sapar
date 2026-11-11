import { describe, expect, it, vi } from 'vitest';
import { appSessionStore, asyncStorageStore, mmkvStore } from './stores';

describe('asyncStorageStore', () => {
    it('delegates to the storage and passes its promises through', async () => {
        const storage = {
            getItem: vi.fn().mockResolvedValue('stored'),
            setItem: vi.fn().mockResolvedValue(undefined),
            removeItem: vi.fn().mockResolvedValue(undefined),
        };
        const store = asyncStorageStore(storage);

        await expect(store.get('k')).resolves.toBe('stored');
        await store.set('k', 'v');
        await store.remove('k');

        expect(storage.getItem).toHaveBeenCalledWith('k');
        expect(storage.setItem).toHaveBeenCalledWith('k', 'v');
        expect(storage.removeItem).toHaveBeenCalledWith('k');
    });
});

describe('mmkvStore', () => {
    function fakeMmkv() {
        const values = new Map<string, string>();
        return {
            getString: (key: string) => values.get(key),
            set: (key: string, value: string) => void values.set(key, value),
            delete: (key: string) => void values.delete(key),
        };
    }

    it('reads, writes and removes synchronously', () => {
        const store = mmkvStore(fakeMmkv());

        store.set('k', 'v');
        expect(store.get('k')).toBe('v');
        store.remove('k');
        expect(store.get('k')).toBeNull();
    });

    it('reports a missing key as null, not undefined', () => {
        expect(mmkvStore(fakeMmkv()).get('missing')).toBeNull();
    });
});

describe('appSessionStore', () => {
    it('keeps values per store instance', () => {
        const session = appSessionStore();
        session.set('k', 'v');

        expect(session.get('k')).toBe('v');
        expect(session.get('other')).toBeNull();
        expect(appSessionStore().get('k')).toBeNull();
    });
});
