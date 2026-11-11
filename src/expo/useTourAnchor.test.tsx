import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef, type ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { getAnchor, subscribeToPress, type AnchorInstance } from './registry';
import { TourScrollView } from './scrollContainer';
import { useTourAnchor } from './useTourAnchor';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);

function Anchor({ name, tourKey = name }: { name: string; tourKey?: string }) {
    return <View testID={name} {...useTourAnchor(tourKey)} />;
}

describe('useTourAnchor', () => {
    it('hands out a ref, a non-collapsable flag and a touch handler', () => {
        let props: ReturnType<typeof useTourAnchor> | undefined;
        function Probe() {
            props = useTourAnchor('hook.shape');
            return null;
        }
        render(<Probe />);

        expect(props).toEqual({ ref: expect.any(Function), collapsable: false, onTouchEnd: expect.any(Function) });
    });

    it('registers the view on mount and unregisters on unmount', () => {
        const { unmount } = render(<Anchor name="hook.mount" />);

        expect(getAnchor('hook.mount')?.instance).toBe(screen.getByTestId('hook.mount'));
        unmount();
        expect(getAnchor('hook.mount')).toBeNull();
    });

    it('moves the registration when the key changes', () => {
        const { rerender } = render(<Anchor name="hook.view" tourKey="hook.first" />);
        expect(getAnchor('hook.first')).not.toBeNull();

        rerender(<Anchor name="hook.view" tourKey="hook.second" />);

        expect(getAnchor('hook.first')).toBeNull();
        expect(getAnchor('hook.second')).not.toBeNull();
    });

    it('reports a touch ending on the view as a press of its key', () => {
        render(<Anchor name="hook.touch" />);
        const pressed = vi.fn();
        const stop = subscribeToPress('hook.touch', pressed);

        fireEvent.touchEnd(screen.getByTestId('hook.touch'));

        expect(pressed).toHaveBeenCalledTimes(1);
        stop();
    });

    it('captures the enclosing scroll container', () => {
        render(
            <>
                <TourScrollView>
                    <Anchor name="hook.inside" />
                </TourScrollView>
                <Anchor name="hook.outside" />
            </>,
        );

        expect(getAnchor('hook.inside')?.container).not.toBeNull();
        expect(getAnchor('hook.outside')?.container).toBeNull();
    });

    describe('on a Pressable with its own handlers', () => {
        function Hosted({ onPress, ...host }: Pick<ComponentProps<typeof Pressable>, 'onPress'> & Parameters<typeof useTourAnchor>[1]) {
            return <Pressable testID="hook.hosted" onPress={onPress} {...useTourAnchor('hook.hosted', host)} />;
        }

        const tap = (element: HTMLElement) => {
            fireEvent.touchEnd(element);
            fireEvent.click(element);
        };

        it('runs its own onPress and reports the press', () => {
            const onPress = vi.fn();
            const pressed = vi.fn();
            render(<Hosted onPress={onPress} />);
            const stop = subscribeToPress('hook.hosted', pressed);

            tap(screen.getByTestId('hook.hosted'));

            expect(onPress).toHaveBeenCalledTimes(1);
            expect(pressed).toHaveBeenCalledTimes(1);
            stop();
        });

        it('composes the host onTouchEnd instead of overwriting it', () => {
            const onTouchEnd = vi.fn();
            const pressed = vi.fn();
            render(<Hosted onTouchEnd={onTouchEnd} />);
            const stop = subscribeToPress('hook.hosted', pressed);

            fireEvent.touchEnd(screen.getByTestId('hook.hosted'));

            expect(onTouchEnd).toHaveBeenCalledTimes(1);
            expect(pressed).toHaveBeenCalledTimes(1);
            stop();
        });

        it('fills the host ref alongside the registration and clears both on unmount', () => {
            const ref = createRef<AnchorInstance>();
            const { unmount } = render(<Hosted ref={ref} />);

            expect(ref.current).toBe(screen.getByTestId('hook.hosted'));
            expect(getAnchor('hook.hosted')?.instance).toBe(ref.current);
            unmount();
            expect(ref.current).toBeNull();
            expect(getAnchor('hook.hosted')).toBeNull();
        });
    });

    afterEach(() => vi.restoreAllMocks());
});
