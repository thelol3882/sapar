import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserSessionStore, localStorageStore } from './stores';

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe('localStorageStore', () => {
    it('persists through localStorage', () => {
        const store = localStorageStore();
        store.set('k', 'v');

        expect(localStorage.getItem('k')).toBe('v');
        expect(store.get('k')).toBe('v');

        store.remove('k');
        expect(store.get('k')).toBeNull();
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('keeps values in memory when writes throw', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });
        const store = localStorageStore();

        store.set('k', 'v');

        expect(store.get('k')).toBe('v');
        store.remove('k');
        expect(store.get('k')).toBeNull();
    });
});

describe('browserSessionStore', () => {
    it('persists through sessionStorage', () => {
        const store = browserSessionStore();
        store.set('k', 'v');
        expect(sessionStorage.getItem('k')).toBe('v');
    });

    it('works in memory when sessionStorage itself is unreachable', () => {
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError');
        });
        const store = browserSessionStore();

        expect(store.get('k')).toBeNull();
        store.set('k', 'v');
        expect(store.get('k')).toBe('v');
    });
});
