import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { createSaparController, defineTour, memorySource, memoryStore } from '../core';
import { SaparProvider } from '../react';
import { createExpoAdapter } from './adapter';
import { TourOverlay } from './TourOverlay';
import { TourStep } from './TourStep';
import { mockWindowRect, pressHardwareBack, resetNativeMock } from './testing/reactNativeMock';
import { useTourAnchor } from './useTourAnchor';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);
vi.mock('react-native-svg', async () => (await import('./testing/reactNativeMock')).svgModule);

beforeEach(resetNativeMock);

const tour = defineTour({
    key: 'onboarding',
    title: 'Onboarding',
    steps: [
        { key: 'welcome', title: 'Welcome', body: 'Let us show you around' },
        { key: 'upgrade', title: 'Upgrade here', body: 'Plans live here', anchor: 'flow.upgrade' },
        { key: 'pay', title: 'Press pay', body: 'Try it yourself', anchor: 'flow.pay', advanceOn: 'press' },
        { key: 'finish', title: 'All set', body: 'Enjoy' },
    ],
});

function Screen() {
    return (
        <>
            <View testID="upgrade" {...useTourAnchor('flow.upgrade')} />
            <View testID="pay" {...useTourAnchor('flow.pay')} />
        </>
    );
}

function Card() {
    return (
        <TourOverlay>
            <TourStep.Root>
                <TourStep.Progress />
                <TourStep.Title />
                <TourStep.Body />
                <TourStep.Skip />
                <TourStep.Back />
                <TourStep.Next />
            </TourStep.Root>
        </TourOverlay>
    );
}

function renderApp() {
    const adapter = createExpoAdapter({ navigate: vi.fn(), currentRoute: () => '/billing' });
    const source = memorySource({ tours: [tour], storage: memoryStore() });
    const recordProgress = vi.spyOn(source, 'recordProgress');
    const controller = createSaparController({ source, adapter, anchorTimeoutMs: 50 });
    render(
        <SaparProvider controller={controller} adapter={adapter}>
            <Screen />
            <Card />
        </SaparProvider>,
    );
    mockWindowRect(screen.getByTestId('upgrade'), { x: 20, y: 100, width: 120, height: 44 });
    mockWindowRect(screen.getByTestId('pay'), { x: 20, y: 200, width: 120, height: 44 });
    return { controller, recordProgress };
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const phase = (controller: ReturnType<typeof renderApp>['controller']) => controller.getSnapshot().runner.phase;

describe('a tour on the Expo adapter', () => {
    it('walks forward and back, and finishes with Done', async () => {
        const { controller, recordProgress } = renderApp();
        await act(() => controller.startTour('onboarding'));

        expect(screen.getByText('Welcome')).toBeInTheDocument();
        expect(screen.getByText('1 / 4')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

        click('Next');
        await screen.findByText('Upgrade here');
        expect(screen.getByText('2 / 4')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('dim').getAttribute('d')).toContain('M20,92 H140'));

        click('Back');
        await screen.findByText('Welcome');

        click('Next');
        await screen.findByText('Upgrade here');
        click('Next');
        await screen.findByText('Press pay');
        fireEvent.touchEnd(screen.getByTestId('pay'));
        await screen.findByText('All set');
        click('Done');

        await waitFor(() => expect(phase(controller)).toBe('idle'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'onboarding', status: 'completed' }));
    });

    it('hides Next on a press-to-advance step and advances when the anchor is touched', async () => {
        const { controller } = renderApp();
        await act(() => controller.startTour('onboarding'));
        click('Next');
        await screen.findByText('Upgrade here');
        click('Next');
        await screen.findByText('Press pay');

        expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
        fireEvent.touchEnd(screen.getByTestId('upgrade'));
        expect(screen.getByText('Press pay')).toBeInTheDocument();

        fireEvent.touchEnd(screen.getByTestId('pay'));

        expect(await screen.findByText('All set')).toBeInTheDocument();
    });

    it('is dismissed by Skip', async () => {
        const { controller, recordProgress } = renderApp();
        await act(() => controller.startTour('onboarding'));

        click('Skip');

        expect(phase(controller)).toBe('idle');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dismissed' }));
    });

    it('is dismissed by pressing the dim layer', async () => {
        const { controller } = renderApp();
        await act(() => controller.startTour('onboarding'));

        fireEvent.click(screen.getByTestId('dim'));

        expect(phase(controller)).toBe('idle');
    });

    it('is dismissed by the Android back button, which is then consumed', async () => {
        const { controller } = renderApp();
        await act(() => controller.startTour('onboarding'));

        let consumed = false;
        act(() => {
            consumed = pressHardwareBack();
        });

        expect(consumed).toBe(true);
        expect(phase(controller)).toBe('idle');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(pressHardwareBack()).toBe(false);
    });
});
