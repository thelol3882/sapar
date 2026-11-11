import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHandle, AnchorRect } from '../core';
import { deferred } from '../core/fixtures';
import { registerAnchor } from './registry';
import type { ScrollContainer } from './scrollContainer';
import { fakeInstance, resetNativeMock, setWindow } from './testing/reactNativeMock';
import { useAnchorRect } from './useAnchorRect';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);

beforeEach(resetNativeMock);

const FIRST: AnchorRect = { x: 1, y: 2, width: 30, height: 40 };
const SECOND: AnchorRect = { x: 5, y: 6, width: 70, height: 80 };

const handleMeasuring = (measure: AnchorHandle['measure']): AnchorHandle => ({ key: 'a', measure, onPress: () => () => {} });

describe('useAnchorRect', () => {
    it('is null without a handle', () => {
        const { result } = renderHook(() => useAnchorRect(null));

        expect(result.current).toBeNull();
    });

    it('measures the handle', async () => {
        const handle = handleMeasuring(async () => FIRST);
        const { result } = renderHook(() => useAnchorRect(handle));

        await waitFor(() => expect(result.current).toEqual(FIRST));
    });

    it('never returns the previous handle rect while a new handle is still being measured', async () => {
        const pending = deferred<AnchorRect | null>();
        const first = handleMeasuring(async () => FIRST);
        const second = handleMeasuring(() => pending.promise);
        const { result, rerender } = renderHook(({ handle }) => useAnchorRect(handle), { initialProps: { handle: first } });
        await waitFor(() => expect(result.current).toEqual(FIRST));

        rerender({ handle: second });
        expect(result.current).toBeNull();

        await act(async () => pending.resolve(SECOND));
        expect(result.current).toEqual(SECOND);
    });

    it('is null when measuring yields null, even after an earlier rect', async () => {
        let measured: AnchorRect | null = FIRST;
        const handle = handleMeasuring(async () => measured);
        const { result } = renderHook(() => useAnchorRect(handle));
        await waitFor(() => expect(result.current).toEqual(FIRST));

        measured = null;
        act(() => setWindow(1024, 768));

        await waitFor(() => expect(result.current).toBeNull());
    });

    it('forgets the rect when the handle goes away, so the same handle is not shown stale', async () => {
        const pending = deferred<AnchorRect | null>();
        let measure: AnchorHandle['measure'] = async () => FIRST;
        const handle = handleMeasuring(() => measure());
        const { result, rerender } = renderHook(({ current }) => useAnchorRect(current), {
            initialProps: { current: handle as AnchorHandle | null },
        });
        await waitFor(() => expect(result.current).toEqual(FIRST));

        rerender({ current: null });
        await waitFor(() => expect(result.current).toBeNull());
        measure = () => pending.promise;
        rerender({ current: handle });

        expect(result.current).toBeNull();
        await act(async () => pending.resolve(SECOND));
        expect(result.current).toEqual(SECOND);
    });

    describe('following its scroll container', () => {
        function registerInContainer() {
            let scrolled = () => {};
            const unsubscribe = vi.fn();
            const container: ScrollContainer = {
                measure: async () => null,
                scrollToOffset: () => {},
                subscribeToScroll: (listener) => {
                    scrolled = listener;
                    return unsubscribe;
                },
            };
            const unregister = registerAnchor('a', { instance: fakeInstance(null), container });
            return { scroll: () => scrolled(), unsubscribe, unregister };
        }

        it('re-measures each time the container scrolls', async () => {
            const { scroll, unregister } = registerInContainer();
            const measure = vi.fn<AnchorHandle['measure']>(async () => FIRST);
            const handle = handleMeasuring(measure);
            const { result } = renderHook(() => useAnchorRect(handle));
            await waitFor(() => expect(result.current).toEqual(FIRST));

            measure.mockResolvedValue(SECOND);
            const measuredBeforeScroll = measure.mock.calls.length;
            act(scroll);

            expect(measure).toHaveBeenCalledTimes(measuredBeforeScroll + 1);
            await waitFor(() => expect(result.current).toEqual(SECOND));
            unregister();
        });

        it('stops following when the handle goes away', () => {
            const { unsubscribe, unregister } = registerInContainer();
            const handle = handleMeasuring(async () => FIRST);
            const { rerender } = renderHook(({ current }) => useAnchorRect(current), {
                initialProps: { current: handle as AnchorHandle | null },
            });

            rerender({ current: null });

            expect(unsubscribe).toHaveBeenCalledTimes(1);
            unregister();
        });
    });
});
