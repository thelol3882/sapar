import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { createExpoAdapter } from './adapter';
import { TourScrollView, useTourScrollContainer } from './scrollContainer';
import { mockLayoutRect, mockWindowRect, scrollToCalls } from './testing/reactNativeMock';
import { useTourAnchor } from './useTourAnchor';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);

function Anchor({ name }: { name: string }) {
    return <View testID={name} {...useTourAnchor(name)} />;
}

describe('TourScrollView', () => {
    it('forwards its ref to the scroll view', () => {
        const ref = createRef<never>();
        render(<TourScrollView ref={ref} testID="scroll" />);

        expect(ref.current).toBe(screen.getByTestId('scroll'));
    });

    it('scrolls an anchor to the middle of the viewport', async () => {
        render(
            <TourScrollView testID="scroll">
                <Anchor name="scroll.target" />
            </TourScrollView>,
        );
        mockWindowRect(screen.getByTestId('scroll'), { x: 0, y: 100, width: 400, height: 600 });
        mockLayoutRect(screen.getByTestId('scroll.target'), { x: 0, y: 1000, width: 100, height: 40 });
        const adapter = createExpoAdapter({ navigate: vi.fn(), currentRoute: () => '/' });
        const handle = await adapter.resolveAnchor('scroll.target', { timeoutMs: 50 });
        if (!handle) throw new Error('anchor did not resolve');

        await adapter.scrollIntoView(handle, { reducedMotion: true });

        expect(scrollToCalls(screen.getByTestId('scroll'))).toEqual([[{ y: 720, animated: false }]]);
    });

    it('does not scroll when the anchor has no layout', async () => {
        render(
            <TourScrollView testID="scroll">
                <Anchor name="scroll.unlaid" />
            </TourScrollView>,
        );
        mockWindowRect(screen.getByTestId('scroll'), { x: 0, y: 100, width: 400, height: 600 });
        mockLayoutRect(screen.getByTestId('scroll.unlaid'), { x: 0, y: 0, width: 0, height: 0 });
        const adapter = createExpoAdapter({ navigate: vi.fn(), currentRoute: () => '/' });
        const handle = await adapter.resolveAnchor('scroll.unlaid', { timeoutMs: 50 });
        if (!handle) throw new Error('anchor did not resolve');

        await adapter.scrollIntoView(handle, { reducedMotion: true });

        expect(scrollToCalls(screen.getByTestId('scroll'))).toEqual([]);
    });

    describe('scroll notifications', () => {
        function subscribeInside() {
            const listener = vi.fn();
            let stop = () => {};
            function Subscriber() {
                const container = useTourScrollContainer();
                stop = container?.subscribeToScroll(listener) ?? stop;
                return null;
            }
            return { listener, stop: () => stop(), Subscriber };
        }

        it('tells subscribers when the user scrolls, once per frame', async () => {
            const { listener, Subscriber } = subscribeInside();
            render(
                <TourScrollView testID="scroll">
                    <Subscriber />
                </TourScrollView>,
            );

            fireEvent.scroll(screen.getByTestId('scroll'));
            fireEvent.scroll(screen.getByTestId('scroll'));
            fireEvent.scroll(screen.getByTestId('scroll'));
            expect(listener).not.toHaveBeenCalled();

            await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
            fireEvent.scroll(screen.getByTestId('scroll'));
            await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
        });

        it('stops telling a subscriber that unsubscribed', async () => {
            const { listener, stop, Subscriber } = subscribeInside();
            render(
                <TourScrollView testID="scroll">
                    <Subscriber />
                </TourScrollView>,
            );

            stop();
            fireEvent.scroll(screen.getByTestId('scroll'));
            await new Promise((resolve) => requestAnimationFrame(resolve));

            expect(listener).not.toHaveBeenCalled();
        });

        it('still calls the host onScroll', () => {
            const onScroll = vi.fn();
            render(<TourScrollView testID="scroll" onScroll={onScroll} />);

            fireEvent.scroll(screen.getByTestId('scroll'));

            expect(onScroll).toHaveBeenCalledTimes(1);
        });
    });

    it('provides its container to descendants only', () => {
        const seen: Array<boolean> = [];
        function Probe() {
            seen.push(useTourScrollContainer() !== null);
            return null;
        }

        render(
            <>
                <Probe />
                <TourScrollView>
                    <Probe />
                </TourScrollView>
            </>,
        );

        expect(seen).toEqual([false, true]);
    });
});
