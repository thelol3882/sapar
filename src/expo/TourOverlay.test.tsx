import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import {
    createTestAdapter,
    createSaparController,
    defineTour,
    memorySource,
    memoryStore,
    type AnchorRect,
    type PlatformAdapter,
    type StepInput,
} from '../core';
import { createHarness } from '../react/testHarness';
import { SaparProvider } from '../react';
import { createExpoAdapter } from './adapter';
import { registerAnchor } from './registry';
import { TourOverlay, type TourOverlayProps } from './TourOverlay';
import {
    fireLayout,
    hardwareBackListenerCount,
    liveInstance,
    pressHardwareBack,
    resetNativeMock,
    setWindow,
    styleOf,
} from './testing/reactNativeMock';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);
vi.mock('react-native-svg', async () => (await import('./testing/reactNativeMock')).svgModule);

beforeEach(resetNativeMock);

const OUTER = 'M0,0 H400 V800 H0 Z';

function tourWith(step: Partial<StepInput> = {}) {
    return defineTour({
        key: 'tour',
        title: 'Tour',
        steps: [{ key: 'only', title: 'Only', body: 'Only body', ...step }, { key: 'last', title: 'Last', body: 'Last body' }],
    });
}

async function startOverlay({
    step,
    adapter = createTestAdapter({ anchors: ['target'], compact: false }),
    props,
}: { step?: Partial<StepInput>; adapter?: PlatformAdapter; props?: Partial<TourOverlayProps> } = {}) {
    const harness = createHarness({ tours: [tourWith(step)], adapter });
    const view = render(
        <TourOverlay {...props}>
            <View testID="card" />
        </TourOverlay>,
        { wrapper: harness.wrapper },
    );
    await act(() => harness.controller.startTour('tour'));
    return { ...harness, rerender: (next: Partial<TourOverlayProps>) => view.rerender(<TourOverlay {...next}><View testID="card" /></TourOverlay>) };
}

const dimPathNow = () => screen.getByTestId('dim').getAttribute('d');
const popover = () => screen.getByTestId('card').parentElement as HTMLElement;

describe('TourOverlay', () => {
    it('renders nothing while no tour is running', () => {
        const { wrapper } = createHarness({ tours: [tourWith()] });
        render(
            <TourOverlay>
                <View testID="card" />
            </TourOverlay>,
            { wrapper },
        );

        expect(screen.queryByTestId('card')).toBeNull();
        expect(screen.queryByTestId('svg')).toBeNull();
    });

    it('builds the card from the running step when given a render function', async () => {
        const harness = createHarness({ tours: [tourWith()], anchors: [] });
        render(<TourOverlay>{(tourStep) => <View testID={`card-${tourStep.step.key}`} />}</TourOverlay>, {
            wrapper: harness.wrapper,
        });
        await act(() => harness.controller.startTour('tour'));

        expect(screen.getByTestId('card-only')).toBeInTheDocument();
    });

    describe('hardware back button', () => {
        it('skips the running tour and consumes the event', async () => {
            const { controller } = await startOverlay();

            expect(pressHardwareBack()).toBe(true);

            expect(controller.getSnapshot().runner.phase).toBe('idle');
        });

        it('leaves the event alone when no tour is running', () => {
            const { wrapper } = createHarness({ tours: [tourWith()] });
            render(<TourOverlay><View /></TourOverlay>, { wrapper });

            expect(hardwareBackListenerCount()).toBe(0);
            expect(pressHardwareBack()).toBe(false);
        });

        it('stops listening once the tour ends', async () => {
            await startOverlay();
            pressHardwareBack();

            await waitFor(() => expect(hardwareBackListenerCount()).toBe(0));
        });
    });
});

describe('TourSpotlight', () => {
    it('dims the whole window for a step without an anchor', async () => {
        await startOverlay({ step: {}, adapter: createTestAdapter({ compact: false }) });

        expect(dimPathNow()).toBe(OUTER);
        expect(screen.getByTestId('dim')).toHaveAttribute('fill-rule', 'evenodd');
    });

    it('cuts a padded hole around the measured anchor', async () => {
        await startOverlay({ step: { anchor: 'target', padding: 8 } });

        await waitFor(() => expect(dimPathNow()).toMatch(new RegExp(`^${OUTER} M0,-8 H100 `)));
    });

    it('lets presses outside the dim path reach the app beneath', async () => {
        await startOverlay({ step: { anchor: 'target' } });

        expect(screen.getByTestId('svg')).toHaveAttribute('data-pointer-events', 'box-none');
    });

    it('skips the tour when the dim layer is pressed', async () => {
        const { controller } = await startOverlay({ step: { anchor: 'target' } });

        fireEvent.click(screen.getByTestId('dim'));

        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('calls onClickOutside instead of skipping when given', async () => {
        const onClickOutside = vi.fn();
        const { controller } = await startOverlay({ step: { anchor: 'target' }, props: { onClickOutside } });

        fireEvent.click(screen.getByTestId('dim'));

        expect(onClickOutside).toHaveBeenCalledTimes(1);
        expect(controller.getSnapshot().runner.phase).toBe('running');
    });

    it('colours the dim layer', async () => {
        await startOverlay({ step: { anchor: 'target' }, props: { spotlightColor: 'rgba(10, 20, 30, 0.8)' } });

        expect(screen.getByTestId('dim')).toHaveAttribute('fill', 'rgba(10, 20, 30, 0.8)');
    });

    describe('measuring', () => {
        function setup(initial: AnchorRect) {
            const current = { rect: initial };
            const stop = registerAnchor('live.target', { instance: liveInstance(() => current.rect), container: null });
            const adapter = createExpoAdapter({ navigate: vi.fn(), currentRoute: () => '/' });
            const source = memorySource({ tours: [tourWith({ anchor: 'live.target', padding: 0 })], storage: memoryStore() });
            const controller = createSaparController({ source, adapter, anchorTimeoutMs: 50 });
            const wrapper = ({ children }: { children: ReactNode }) => (
                <SaparProvider controller={controller} adapter={adapter}>
                    {children}
                </SaparProvider>
            );
            render(<TourOverlay><View /></TourOverlay>, { wrapper });
            return { current, controller, stop };
        }

        it('re-measures when the window is resized', async () => {
            const { current, controller, stop } = setup({ x: 10, y: 20, width: 100, height: 40 });
            await act(() => controller.startTour('tour'));
            await waitFor(() => expect(dimPathNow()).toContain('M18,20 H102'));

            current.rect = { x: 50, y: 60, width: 100, height: 40 };
            act(() => setWindow(1024, 768));

            await waitFor(() => expect(dimPathNow()).toBe('M0,0 H1024 V768 H0 Z M58,60 H142 A8,8 0 0 1 150,68 V92 A8,8 0 0 1 142,100 H58 A8,8 0 0 1 50,92 V68 A8,8 0 0 1 58,60 Z'));
            stop();
        });

        it('keeps measuring for a moment because layout settles late', async () => {
            const { current, controller, stop } = setup({ x: 10, y: 20, width: 100, height: 40 });
            await act(() => controller.startTour('tour'));
            await waitFor(() => expect(dimPathNow()).toContain('M18,20 H102'));

            current.rect = { x: 30, y: 20, width: 100, height: 40 };

            await waitFor(() => expect(dimPathNow()).toContain('M38,20 H122'));
            stop();
        });
    });
});

describe('TourPopover', () => {
    it('centres the card in the window for a step without an anchor', async () => {
        await startOverlay({ step: {}, adapter: createTestAdapter({ compact: false }) });

        expect(styleOf(popover())).toMatchObject({
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 8,
            paddingBottom: 8,
        });
        expect(popover()).toHaveAttribute('data-pointer-events', 'box-none');
    });

    it('stays hidden until the card has been measured, then sits below the anchor', async () => {
        await startOverlay({ step: { anchor: 'target', placement: 'bottom' } });
        await waitFor(() => expect(styleOf(popover())).toMatchObject({ opacity: 0 }));

        fireLayout(popover(), { width: 200, height: 100 });

        await waitFor(() =>
            expect(styleOf(popover())).toMatchObject({ transform: [{ translateX: 8 }, { translateY: 52 }] }),
        );
        expect(styleOf(popover()).opacity).toBeUndefined();
    });

    it('flips to the other side when the preferred one has no room', async () => {
        const adapter = createTestAdapter({ anchors: ['target'], compact: false });
        await startOverlay({ step: { anchor: 'target', placement: 'top' }, adapter });
        await waitFor(() => expect(popover()).toBeInTheDocument());

        fireLayout(popover(), { width: 200, height: 100 });

        await waitFor(() => expect(styleOf(popover()).transform).toEqual([{ translateX: 8 }, { translateY: 52 }]));
    });

    it('keeps the given gap and insets', async () => {
        await startOverlay({
            step: { anchor: 'target', placement: 'bottom' },
            props: { insets: { left: 30 } },
        });
        await waitFor(() => expect(popover()).toBeInTheDocument());

        fireLayout(popover(), { width: 200, height: 100 });

        await waitFor(() => expect(styleOf(popover()).transform).toEqual([{ translateX: 30 }, { translateY: 52 }]));
    });

    it('is a full-width bottom sheet on compact windows, above the safe area', async () => {
        const adapter = createTestAdapter({ anchors: ['target'], compact: true });
        await startOverlay({ step: { anchor: 'target' }, adapter, props: { insets: { bottom: 34 } } });

        expect(styleOf(popover())).toMatchObject({
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: 34,
            paddingTop: 0,
        });
    });

    describe('presentation', () => {
        const isSheet = () => styleOf(popover()).bottom === 0;
        const measureCard = async (size: { width: number; height: number }) => {
            await waitFor(() => expect(popover()).toBeInTheDocument());
            fireLayout(popover(), size);
        };

        it('is anchored by default on a phone-width window', async () => {
            setWindow(360, 640);
            await startOverlay({ step: { anchor: 'target' } });

            await measureCard({ width: 200, height: 100 });

            await waitFor(() => expect(styleOf(popover()).transform).toBeDefined());
            expect(isSheet()).toBe(false);
        });

        it('falls back to the sheet when the card is taller than the room beside the anchor', async () => {
            await startOverlay({ step: { anchor: 'target' } });

            await measureCard({ width: 200, height: 900 });

            await waitFor(() => expect(isSheet()).toBe(true));
        });

        it('returns to the anchored card once it fits again', async () => {
            await startOverlay({ step: { anchor: 'target' } });
            await measureCard({ width: 200, height: 900 });
            await waitFor(() => expect(isSheet()).toBe(true));

            act(() => setWindow(400, 1200));

            await waitFor(() => expect(isSheet()).toBe(false));
        });

        it('is a sheet on windows narrower than the adapter breakpoint', async () => {
            const adapter = createTestAdapter({ anchors: ['target'], compact: true });
            await startOverlay({ step: { anchor: 'target' }, adapter });

            expect(isSheet()).toBe(true);
        });

        it('stays anchored on compact windows when asked to', async () => {
            const adapter = createTestAdapter({ anchors: ['target'], compact: true });
            await startOverlay({ step: { anchor: 'target' }, adapter, props: { presentation: 'anchored' } });

            await measureCard({ width: 200, height: 100 });

            await waitFor(() => expect(styleOf(popover()).transform).toEqual([{ translateX: 8 }, { translateY: 52 }]));
        });

        it('stays anchored, clamped, when the card does not fit and anchored is asked for', async () => {
            await startOverlay({ step: { anchor: 'target' }, props: { presentation: 'anchored' } });

            await measureCard({ width: 200, height: 900 });

            await waitFor(() => expect(styleOf(popover()).transform).toBeDefined());
            expect(isSheet()).toBe(false);
        });

        it('is always a sheet when asked to', async () => {
            await startOverlay({ step: { anchor: 'target' }, props: { presentation: 'sheet' } });

            expect(isSheet()).toBe(true);
        });

        it('is centred without an anchor, whatever the window width', async () => {
            const adapter = createTestAdapter({ compact: false });
            await startOverlay({ step: {}, adapter, props: { presentation: 'anchored' } });

            expect(styleOf(popover())).toMatchObject({ justifyContent: 'center' });
        });

        it('reads the prop on every render', async () => {
            const { rerender } = await startOverlay({ step: { anchor: 'target' }, props: { presentation: 'sheet' } });
            expect(isSheet()).toBe(true);

            rerender({ presentation: 'anchored' });
            await measureCard({ width: 200, height: 100 });

            await waitFor(() => expect(isSheet()).toBe(false));
        });
    });

    it('lets the host style the popover', async () => {
        await startOverlay({ step: { anchor: 'target' }, props: { popoverStyle: { zIndex: 5 } } });

        expect(styleOf(popover())).toMatchObject({ zIndex: 5 });
    });
});
