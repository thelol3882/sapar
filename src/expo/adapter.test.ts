import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpoAdapter, type ExpoAdapterOptions } from './adapter';
import { registerAnchor, notifyPress } from './registry';
import type { ScrollContainer } from './scrollContainer';
import { fakeInstance, nativeState, resetNativeMock, setReduceMotion, setWindow } from './testing/reactNativeMock';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);

beforeEach(resetNativeMock);
afterEach(() => vi.useRealTimers());

function makeAdapter(options: Partial<ExpoAdapterOptions> = {}) {
    return createExpoAdapter({ navigate: vi.fn(), currentRoute: () => '/home', ...options });
}

describe('createExpoAdapter', () => {
    it('is the native platform and reports the host router route', () => {
        const adapter = makeAdapter();

        expect(adapter.platform).toBe('native');
        expect(adapter.currentRoute()).toBe('/home');
    });

    it('navigates through the host and resolves afterwards', async () => {
        const navigate = vi.fn();
        const adapter = makeAdapter({ navigate });

        await adapter.navigate('/billing');

        expect(navigate).toHaveBeenCalledWith('/billing');
    });

    it('waits for an async host navigation', async () => {
        let finished = false;
        const adapter = makeAdapter({ navigate: () => new Promise((resolve) => setTimeout(resolve, 20)).then(() => void (finished = true)) });

        await adapter.navigate('/billing');

        expect(finished).toBe(true);
    });

    describe('anchors', () => {
        it('resolves a registered anchor to a handle', async () => {
            const unregister = registerAnchor('adapter.resolve', { instance: fakeInstance(null), container: null });

            const handle = await makeAdapter().resolveAnchor('adapter.resolve', { timeoutMs: 50 });

            expect(handle?.key).toBe('adapter.resolve');
            unregister();
        });

        it('waits for an anchor that registers during the timeout', async () => {
            const adapter = makeAdapter();
            const pending = adapter.resolveAnchor('adapter.late', { timeoutMs: 1000 });

            const unregister = registerAnchor('adapter.late', { instance: fakeInstance(null), container: null });

            await expect(pending).resolves.toMatchObject({ key: 'adapter.late' });
            unregister();
        });

        it('resolves null instead of rejecting when the anchor never appears', async () => {
            await expect(makeAdapter().resolveAnchor('adapter.missing', { timeoutMs: 10 })).resolves.toBeNull();
        });

        it('measures through measureInWindow', async () => {
            const rect = { x: 10, y: 20, width: 100, height: 40 };
            const unregister = registerAnchor('adapter.measure', { instance: fakeInstance(rect), container: null });
            const handle = await makeAdapter().resolveAnchor('adapter.measure', { timeoutMs: 50 });

            await expect(handle?.measure()).resolves.toEqual(rect);
            unregister();
        });

        it('measures null for a view without size', async () => {
            const unregister = registerAnchor('adapter.zero', { instance: fakeInstance(null), container: null });
            const handle = await makeAdapter().resolveAnchor('adapter.zero', { timeoutMs: 50 });

            await expect(handle?.measure()).resolves.toBeNull();
            unregister();
        });

        it('measures null once the view is gone', async () => {
            const unregister = registerAnchor('adapter.gone', { instance: fakeInstance({ x: 0, y: 0, width: 5, height: 5 }), container: null });
            const handle = await makeAdapter().resolveAnchor('adapter.gone', { timeoutMs: 50 });

            unregister();

            await expect(handle?.measure()).resolves.toBeNull();
        });

        it('measures the current view after a remount', async () => {
            const unregisterFirst = registerAnchor('adapter.remount', { instance: fakeInstance({ x: 1, y: 1, width: 5, height: 5 }), container: null });
            const handle = await makeAdapter().resolveAnchor('adapter.remount', { timeoutMs: 50 });
            unregisterFirst();
            const moved = { x: 50, y: 60, width: 7, height: 8 };
            const unregisterSecond = registerAnchor('adapter.remount', { instance: fakeInstance(moved), container: null });

            await expect(handle?.measure()).resolves.toEqual(moved);
            unregisterSecond();
        });

        it('reports presses of the anchor until unsubscribed', async () => {
            const unregister = registerAnchor('adapter.press', { instance: fakeInstance(null), container: null });
            const handle = await makeAdapter().resolveAnchor('adapter.press', { timeoutMs: 50 });
            const pressed = vi.fn();
            const stop = handle?.onPress(pressed);

            notifyPress('adapter.press');
            stop?.();
            notifyPress('adapter.press');

            expect(pressed).toHaveBeenCalledTimes(1);
            unregister();
        });
    });

    describe('scrollIntoView', () => {
        function containerWith(measurement: Awaited<ReturnType<ScrollContainer['measure']>>) {
            return {
                measure: vi.fn().mockResolvedValue(measurement),
                scrollToOffset: vi.fn(),
                subscribeToScroll: vi.fn(),
            } satisfies ScrollContainer;
        }

        async function handleIn(key: string, container: ScrollContainer | null) {
            const unregister = registerAnchor(key, { instance: fakeInstance(null), container });
            const handle = await makeAdapter().resolveAnchor(key, { timeoutMs: 50 });
            if (!handle) throw new Error('anchor did not resolve');
            return { handle, unregister };
        }

        it('centres the anchor in its container with an animated scroll, then lets it settle', async () => {
            const container = containerWith({ offsetY: 1000, height: 40, viewportHeight: 600 });
            const { handle, unregister } = await handleIn('scroll.animated', container);
            vi.useFakeTimers();

            let settled = false;
            const scrolling = makeAdapter().scrollIntoView(handle, { reducedMotion: false }).then(() => void (settled = true));
            await vi.advanceTimersByTimeAsync(0);

            expect(container.scrollToOffset).toHaveBeenCalledWith(720, true);
            expect(settled).toBe(false);
            await vi.advanceTimersByTimeAsync(1000);
            await scrolling;
            expect(settled).toBe(true);
            unregister();
        });

        it('jumps without animation and without waiting under reduced motion', async () => {
            const container = containerWith({ offsetY: 1000, height: 40, viewportHeight: 600 });
            const { handle, unregister } = await handleIn('scroll.reduced', container);

            await makeAdapter().scrollIntoView(handle, { reducedMotion: true });

            expect(container.scrollToOffset).toHaveBeenCalledWith(720, false);
            unregister();
        });

        it('never scrolls above the top', async () => {
            const container = containerWith({ offsetY: 10, height: 40, viewportHeight: 600 });
            const { handle, unregister } = await handleIn('scroll.top', container);

            await makeAdapter().scrollIntoView(handle, { reducedMotion: true });

            expect(container.scrollToOffset).toHaveBeenCalledWith(0, false);
            unregister();
        });

        it('does nothing outside a scroll container', async () => {
            const { handle, unregister } = await handleIn('scroll.none', null);

            await expect(makeAdapter().scrollIntoView(handle, { reducedMotion: false })).resolves.toBeUndefined();
            unregister();
        });

        it('does nothing when the container cannot measure the anchor', async () => {
            const container = containerWith(null);
            const { handle, unregister } = await handleIn('scroll.unmeasurable', container);

            await makeAdapter().scrollIntoView(handle, { reducedMotion: false });

            expect(container.scrollToOffset).not.toHaveBeenCalled();
            unregister();
        });

        it('does nothing for an anchor that is gone', async () => {
            const container = containerWith({ offsetY: 100, height: 40, viewportHeight: 600 });
            const { handle, unregister } = await handleIn('scroll.removed', container);
            unregister();

            await makeAdapter().scrollIntoView(handle, { reducedMotion: false });

            expect(container.scrollToOffset).not.toHaveBeenCalled();
        });
    });

    describe('reduced motion', () => {
        it('starts as false, then follows the platform setting once it is known', async () => {
            nativeState.reduceMotion = true;
            const adapter = makeAdapter();

            expect(adapter.prefersReducedMotion()).toBe(false);
            await vi.waitFor(() => expect(adapter.prefersReducedMotion()).toBe(true));
        });

        it('follows changes of the setting', async () => {
            const adapter = makeAdapter();

            setReduceMotion(true);
            expect(adapter.prefersReducedMotion()).toBe(true);
            setReduceMotion(false);
            expect(adapter.prefersReducedMotion()).toBe(false);
        });
    });

    describe('isCompact', () => {
        it('is never compact by default, so phones get anchored cards', () => {
            const adapter = makeAdapter();

            setWindow(320, 568);
            expect(adapter.isCompact()).toBe(false);
            setWindow(1024, 768);
            expect(adapter.isCompact()).toBe(false);
        });

        it('takes a custom breakpoint', () => {
            const adapter = makeAdapter({ compactBreakpointPx: 500 });

            setWindow(499, 800);
            expect(adapter.isCompact()).toBe(true);
            setWindow(500, 800);
            expect(adapter.isCompact()).toBe(false);
        });
    });

    describe('session', () => {
        it('keeps values in memory, separately per adapter', () => {
            const adapter = makeAdapter();
            adapter.session.set('k', 'v');

            expect(adapter.session.get('k')).toBe('v');
            expect(makeAdapter().session.get('k')).toBeNull();
        });

        it('uses the given session store', () => {
            const session = { get: vi.fn(() => 'given'), set: vi.fn() };

            expect(makeAdapter({ session }).session).toBe(session);
        });
    });

    it('reads the clock from Date.now', () => {
        vi.useFakeTimers({ now: 1234 });

        expect(makeAdapter().now()).toBe(1234);
    });
});
