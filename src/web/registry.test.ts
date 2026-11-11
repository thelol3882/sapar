import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAnchorElement, registerAnchor, subscribeToAnchors, waitForAnchor } from './registry';

const cleanups: Array<() => void> = [];

function register(key: string, element = document.createElement('div')): HTMLElement {
    document.body.append(element);
    cleanups.push(registerAnchor(key, element), () => element.remove());
    return element;
}

afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('getAnchorElement', () => {
    it('returns the registered element', () => {
        const element = register('a.one');
        expect(getAnchorElement('a.one')).toBe(element);
    });

    it('falls back to a data-sapar attribute', () => {
        document.body.innerHTML = '<button data-sapar="a.fallback"></button>';
        expect(getAnchorElement('a.fallback')).toBe(document.querySelector('button'));
    });

    it('prefers the registered element over the attribute', () => {
        document.body.innerHTML = '<button data-sapar="a.both"></button>';
        const element = register('a.both');
        expect(getAnchorElement('a.both')).toBe(element);
    });

    it('returns null for an unknown key', () => {
        expect(getAnchorElement('a.missing')).toBeNull();
    });

    it('does not return a registered element that left the document', () => {
        const element = register('a.gone');
        element.remove();

        expect(getAnchorElement('a.gone')).toBeNull();
    });

    it('falls back to a replacement carrying the attribute when the registered element left', () => {
        register('a.replaced').remove();
        document.body.innerHTML = '<button data-sapar="a.replaced"></button>';

        expect(getAnchorElement('a.replaced')).toBe(document.querySelector('button'));
    });
});

describe('waitForAnchor', () => {
    it('resolves immediately for a registered anchor', async () => {
        const element = register('a.now');
        await expect(waitForAnchor('a.now', 1000)).resolves.toBe(element);
    });

    it('resolves immediately for an attribute-only anchor', async () => {
        document.body.innerHTML = '<span data-sapar="a.attr"></span>';
        await expect(waitForAnchor('a.attr', 1000)).resolves.toBe(document.querySelector('span'));
    });

    it('resolves every waiter when the anchor registers later', async () => {
        const first = waitForAnchor('a.later', 1000);
        const second = waitForAnchor('a.later', 1000);
        const element = register('a.later');
        await expect(Promise.all([first, second])).resolves.toEqual([element, element]);
    });

    it('resolves null on timeout', async () => {
        vi.useFakeTimers();
        const waiting = waitForAnchor('a.never', 500);
        await vi.advanceTimersByTimeAsync(500);
        await expect(waiting).resolves.toBeNull();
    });

    it('does not resolve a timed-out waiter again when the anchor registers afterwards', async () => {
        vi.useFakeTimers();
        const waiting = waitForAnchor('a.late', 100);
        await vi.advanceTimersByTimeAsync(100);
        register('a.late');
        await expect(waiting).resolves.toBeNull();
    });
});

describe('registerAnchor', () => {
    it('warns when a second connected element claims the key', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        register('a.dup');
        const second = register('a.dup');

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate anchor "a.dup"'));
        expect(getAnchorElement('a.dup')).toBe(second);
    });

    it('does not warn when the previous element is already gone', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const first = register('a.remount');
        first.remove();
        register('a.remount');

        expect(warn).not.toHaveBeenCalled();
    });

    it('unregisters only its own registration', () => {
        const first = document.createElement('div');
        const unregisterFirst = registerAnchor('a.swap', first);
        const second = register('a.swap');

        unregisterFirst();

        expect(getAnchorElement('a.swap')).toBe(second);
    });
});

describe('waitForAnchor with plain markup', () => {
    it('resolves when a data-sapar element is added later', async () => {
        const waiting = waitForAnchor('a.markup', 1000);
        const element = document.createElement('section');
        element.setAttribute('data-sapar', 'a.markup');
        document.body.append(element);

        expect(await waiting).toBe(element);
    });
});

describe('subscribeToAnchors', () => {
    const nextMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

    it('notifies when a plain data-sapar element is removed', async () => {
        document.body.innerHTML = '<section data-sapar="a.plain"></section>';
        const listener = vi.fn();
        const unsubscribe = subscribeToAnchors(listener);

        document.querySelector('section')?.remove();
        await nextMutations();

        expect(listener).toHaveBeenCalled();
        unsubscribe();
    });

    it('stops watching the document after the last unsubscribe', async () => {
        document.body.innerHTML = '<section data-sapar="a.quiet"></section>';
        const listener = vi.fn();
        subscribeToAnchors(listener)();

        document.querySelector('section')?.remove();
        await nextMutations();

        expect(listener).not.toHaveBeenCalled();
    });

    it('notifies on registration and unregistration', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeToAnchors(listener);

        register('a.hook');
        cleanups.splice(0).forEach((cleanup) => cleanup());

        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });
});
