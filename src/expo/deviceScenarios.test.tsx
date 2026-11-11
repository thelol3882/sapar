// These tests drive the real adapter, registry, hooks and components over a mocked react-native, with a fake "world"
// that answers measurements. They prove the logic reacts to scrolls, keyboard, rotation and presses; they cannot prove
// that a device delivers those events, in that order, or measures the way the fake does.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaparController, defineTour, memorySource, memoryStore, type AnchorRect, type StepInput } from '../core';
import { SaparProvider } from '../react';
import { createExpoAdapter } from './adapter';
import { registerAnchor } from './registry';
import { TourScrollView } from './scrollContainer';
import {
    emitKeyboard,
    fireLayout,
    liveInstance,
    mockLayoutRect,
    mockScrollTo,
    mockWindowRect,
    resetNativeMock,
    setReduceMotion,
    setWindow,
    styleOf,
} from './testing/reactNativeMock';
import { TourOverlay, type TourOverlayProps } from './TourOverlay';
import { useTourAnchor } from './useTourAnchor';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);
vi.mock('react-native-svg', async () => (await import('./testing/reactNativeMock')).svgModule);

beforeEach(resetNativeMock);

const CARD = { width: 200, height: 120 };

function createExpoHarness(steps: StepInput[]) {
    const tour = defineTour({ key: 'tour', title: 'Tour', steps });
    const adapter = createExpoAdapter({ navigate: vi.fn(), currentRoute: () => '/' });
    const source = memorySource({ tours: [tour], storage: memoryStore() });
    const controller = createSaparController({ source, adapter, anchorTimeoutMs: 50 });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <SaparProvider controller={controller} adapter={adapter}>
            {children}
        </SaparProvider>
    );
    return { controller, wrapper };
}

const dimPath = () => screen.getByTestId('dim').getAttribute('d');
const cardPopover = () => screen.getByTestId('card').parentElement as HTMLElement;
const cardTransform = () => styleOf(cardPopover()).transform;

async function showCard() {
    await waitFor(() => expect(styleOf(cardPopover()).opacity).toBe(0));
    fireLayout(cardPopover(), CARD);
    await waitFor(() => expect(cardTransform()).toBeDefined());
}

describe('an anchor inside a TourScrollView that starts off screen', () => {
    const VIEWPORT: AnchorRect = { x: 0, y: 100, width: 400, height: 600 };
    const CONTENT_Y = 1000;
    const world = { scrollY: 0 };

    function Target() {
        return <View testID="target" {...useTourAnchor('target')} />;
    }

    async function startScrolledTour() {
        world.scrollY = 0;
        setReduceMotion(true);
        const { controller, wrapper } = createExpoHarness([{ key: 'only', title: 'Only', body: 'B', anchor: 'target', padding: 0 }]);
        render(
            <>
                <TourScrollView testID="scroll">
                    <Target />
                </TourScrollView>
                <TourOverlay>
                    <View testID="card" />
                </TourOverlay>
            </>,
            { wrapper },
        );
        mockWindowRect(screen.getByTestId('scroll'), VIEWPORT);
        mockScrollTo(screen.getByTestId('scroll'), (offsetY) => (world.scrollY = offsetY));
        mockLayoutRect(screen.getByTestId('target'), { x: 20, y: CONTENT_Y, width: 100, height: 40 });
        mockWindowRect(screen.getByTestId('target'), () => ({
            x: 20,
            y: VIEWPORT.y + CONTENT_Y - world.scrollY,
            width: 100,
            height: 40,
        }));

        const scrollWhenShown: number[] = [];
        controller.subscribe(() => {
            if (controller.getSnapshot().runner.phase === 'running') scrollWhenShown.push(world.scrollY);
        });
        await act(() => controller.startTour('tour'));
        return { scrollWhenShown };
    }

    it('is scrolled into view before the step is shown, with the spotlight and card on it', async () => {
        const { scrollWhenShown } = await startScrolledTour();

        expect(scrollWhenShown[0]).toBe(720);
        await waitFor(() => expect(dimPath()).toContain('M28,380 '));
        await showCard();
        expect(cardTransform()).toEqual([{ translateX: 8 }, { translateY: 432 }]);
    });

    it('follows the anchor when the user scrolls during the step', async () => {
        await startScrolledTour();
        await showCard();
        // useAnchorRect polls for a moment after the step shows; wait it out so only the scroll can explain the move.
        await new Promise((resolve) => setTimeout(resolve, 750));

        world.scrollY = 820;
        fireEvent.scroll(screen.getByTestId('scroll'));

        await waitFor(() => expect(dimPath()).toContain('M28,280 '));
        await waitFor(() => expect(cardTransform()).toEqual([{ translateX: 8 }, { translateY: 332 }]));
    });
});

describe('the card near the bottom of the screen', () => {
    const TAB_BAR_PX = 83;
    const nearBottom: AnchorRect = { x: 150, y: 600, width: 100, height: 40 };

    async function showCardFor(anchor: AnchorRect, props: Partial<TourOverlayProps> = {}) {
        const { controller, wrapper } = createExpoHarness([{ key: 'only', title: 'Only', body: 'B', anchor: 'near.bottom' }]);
        const unregister = registerAnchor('near.bottom', { instance: liveInstance(() => anchor), container: null });
        render(
            <TourOverlay {...props}>
                <View testID="card" />
            </TourOverlay>,
            { wrapper },
        );
        await act(() => controller.startTour('tour'));
        return unregister;
    }

    it('sits below the anchor when there is room', async () => {
        const unregister = await showCardFor(nearBottom);
        await showCard();

        expect(cardTransform()).toEqual([{ translateX: 100 }, { translateY: 652 }]);
        unregister();
    });

    it('stays above a bottom inset that includes the native tab bar', async () => {
        const unregister = await showCardFor(nearBottom, { insets: { bottom: TAB_BAR_PX } });
        await showCard();

        expect(cardTransform()).toEqual([{ translateX: 100 }, { translateY: 468 }]);
        unregister();
    });

    it('keeps the card above the keyboard that covers the anchor, and returns when it hides', async () => {
        const unregister = await showCardFor(nearBottom);
        await showCard();

        act(() => emitKeyboard('keyboardDidShow', 300));
        await waitFor(() => expect(cardTransform()).toEqual([{ translateX: 100 }, { translateY: 372 }]));

        act(() => emitKeyboard('keyboardDidHide'));
        await waitFor(() => expect(cardTransform()).toEqual([{ translateX: 100 }, { translateY: 652 }]));
        unregister();
    });

    it('lifts the bottom sheet above the keyboard, which covers the bottom inset', async () => {
        const unregister = await showCardFor(nearBottom, { presentation: 'sheet', insets: { bottom: 34 } });
        expect(styleOf(cardPopover()).paddingBottom).toBe(34);

        act(() => emitKeyboard('keyboardWillShow', 300));
        expect(styleOf(cardPopover()).paddingBottom).toBe(308);

        act(() => emitKeyboard('keyboardWillHide'));
        expect(styleOf(cardPopover()).paddingBottom).toBe(34);
        unregister();
    });
});

describe('rotation', () => {
    it('recomputes the card position from the new window and the re-measured anchor', async () => {
        const anchor = { current: { x: 150, y: 300, width: 100, height: 40 } };
        const { controller, wrapper } = createExpoHarness([{ key: 'only', title: 'Only', body: 'B', anchor: 'rotating' }]);
        const unregister = registerAnchor('rotating', { instance: liveInstance(() => anchor.current), container: null });
        render(
            <TourOverlay>
                <View testID="card" />
            </TourOverlay>,
            { wrapper },
        );
        await act(() => controller.startTour('tour'));
        await showCard();
        expect(cardTransform()).toEqual([{ translateX: 100 }, { translateY: 352 }]);

        anchor.current = { x: 500, y: 100, width: 100, height: 40 };
        act(() => setWindow(800, 400));

        await waitFor(() => expect(cardTransform()).toEqual([{ translateX: 450 }, { translateY: 152 }]));
        unregister();
    });
});

describe('advanceOn press on a Pressable with its own onPress', () => {
    function BuyButton({ onPress }: { onPress: () => void }) {
        return <Pressable testID="buy" onPress={onPress} {...useTourAnchor('buy')} />;
    }

    it('runs the onPress and advances the tour', async () => {
        const onPress = vi.fn();
        const { controller, wrapper } = createExpoHarness([
            { key: 'buy', title: 'Buy', body: 'B', anchor: 'buy', advanceOn: 'press' },
            { key: 'done', title: 'Done', body: 'B' },
        ]);
        render(<BuyButton onPress={onPress} />, { wrapper });
        await act(() => controller.startTour('tour'));
        expect(controller.getSnapshot().runner.index).toBe(0);

        const button = screen.getByTestId('buy');
        fireEvent.touchEnd(button);
        fireEvent.click(button);

        expect(onPress).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(controller.getSnapshot().runner.index).toBe(1));
    });
});
