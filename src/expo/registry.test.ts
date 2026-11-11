import { describe, expect, it, vi } from 'vitest';
import { getAnchor, notifyPress, registerAnchor, subscribeToPress, waitForAnchor } from './registry';
import { fakeInstance } from './testing/reactNativeMock';

const anchorAt = (key: string) => ({ key, anchor: { instance: fakeInstance(null), container: null } });

describe('anchor registry', () => {
    it('finds a registered anchor and forgets it on unregister', () => {
        const { anchor } = anchorAt('reg.basic');
        const unregister = registerAnchor('reg.basic', anchor);

        expect(getAnchor('reg.basic')).toBe(anchor);
        unregister();
        expect(getAnchor('reg.basic')).toBeNull();
    });

    it('lets a remount win even when the old cleanup runs late', () => {
        const first = anchorAt('reg.remount').anchor;
        const second = anchorAt('reg.remount').anchor;
        const unregisterFirst = registerAnchor('reg.remount', first);
        const unregisterSecond = registerAnchor('reg.remount', second);

        unregisterFirst();

        expect(getAnchor('reg.remount')).toBe(second);
        unregisterSecond();
    });

    describe('waitForAnchor', () => {
        it('resolves immediately for a registered anchor', async () => {
            const { anchor } = anchorAt('wait.present');
            const unregister = registerAnchor('wait.present', anchor);

            await expect(waitForAnchor('wait.present', 1000)).resolves.toBe(anchor);
            unregister();
        });

        it('resolves when the anchor registers later', async () => {
            const { anchor } = anchorAt('wait.later');
            const pending = waitForAnchor('wait.later', 1000);

            const unregister = registerAnchor('wait.later', anchor);

            await expect(pending).resolves.toBe(anchor);
            unregister();
        });

        it('wakes every waiter for the key', async () => {
            const { anchor } = anchorAt('wait.many');
            const pending = [waitForAnchor('wait.many', 1000), waitForAnchor('wait.many', 1000)];

            const unregister = registerAnchor('wait.many', anchor);

            await expect(Promise.all(pending)).resolves.toEqual([anchor, anchor]);
            unregister();
        });

        it('resolves null on timeout and does not resolve late', async () => {
            vi.useFakeTimers();
            const pending = waitForAnchor('wait.timeout', 500);

            await vi.advanceTimersByTimeAsync(500);
            await expect(pending).resolves.toBeNull();

            vi.useRealTimers();
            registerAnchor('wait.timeout', anchorAt('wait.timeout').anchor)();
        });
    });

    describe('presses', () => {
        it('notifies only the listeners of the pressed key', () => {
            const pressed = vi.fn();
            const other = vi.fn();
            const stop = subscribeToPress('press.a', pressed);
            const stopOther = subscribeToPress('press.b', other);

            notifyPress('press.a');

            expect(pressed).toHaveBeenCalledTimes(1);
            expect(other).not.toHaveBeenCalled();
            stop();
            stopOther();
        });

        it('stops notifying after unsubscribe', () => {
            const pressed = vi.fn();
            subscribeToPress('press.c', pressed)();

            notifyPress('press.c');

            expect(pressed).not.toHaveBeenCalled();
        });
    });
});
