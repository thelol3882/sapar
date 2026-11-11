import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineTour } from '../core';
import { createHarness } from '../react/testHarness';
import { TourStep, type TourStepRootProps } from './TourStep';
import { announceForAccessibility, resetNativeMock } from './testing/reactNativeMock';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);

beforeEach(resetNativeMock);

const tour = defineTour({
    key: 'tour',
    title: 'Tour',
    steps: [
        { key: 'first', title: 'First', body: 'First body' },
        { key: 'second', title: 'Second', body: 'Second body', anchor: 'btn.press', advanceOn: 'press' },
        { key: 'third', title: 'Third', body: 'Third body' },
    ],
});

function Card({ root, showOnPress }: { root?: TourStepRootProps; showOnPress?: boolean }) {
    return (
        <TourStep.Root {...root}>
            <TourStep.Progress />
            <TourStep.Title />
            <TourStep.Body />
            <TourStep.Back />
            <TourStep.Next showOnPress={showOnPress} />
            <TourStep.Skip />
            <TourStep.Close />
        </TourStep.Root>
    );
}

async function startTour(props: Parameters<typeof Card>[0] = {}) {
    const harness = createHarness({ tours: [tour], anchors: ['btn.press'] });
    render(<Card {...props} />, { wrapper: harness.wrapper });
    await act(() => harness.controller.startTour('tour'));
    return harness;
}

describe('TourStep', () => {
    it('renders nothing while no tour is running', () => {
        const { wrapper } = createHarness({ tours: [tour] });
        render(<Card />, { wrapper });

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('is a non-modal dialog with a heading, body and progress', async () => {
        await startTour();

        expect(screen.getByRole('dialog')).toHaveAttribute('data-modal', 'false');
        expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
        expect(screen.getByText('First body')).toBeInTheDocument();
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('announces each step to screen readers, with an overridable text', async () => {
        const { controller } = await startTour();
        expect(announceForAccessibility).toHaveBeenLastCalledWith('Step 1 of 3: First');

        await act(() => controller.next());

        expect(announceForAccessibility).toHaveBeenLastCalledWith('Step 2 of 3: Second');
        expect(announceForAccessibility).toHaveBeenCalledTimes(2);
    });

    it('uses the given announcement text', async () => {
        await startTour({ root: { announceStep: ({ position, total, title }) => `${title} (${position}/${total})` } });

        expect(announceForAccessibility).toHaveBeenCalledWith('First (1/3)');
    });

    it('does not repeat the announcement when the card re-renders', async () => {
        const harness = createHarness({ tours: [tour], anchors: ['btn.press'] });
        const { rerender } = render(<Card root={{ announceStep: () => 'once' }} />, { wrapper: harness.wrapper });
        await act(() => harness.controller.startTour('tour'));
        announceForAccessibility.mockClear();

        rerender(<Card root={{ announceStep: () => 'twice' }} />);

        expect(announceForAccessibility).not.toHaveBeenCalled();
    });

    it('hides Back on the first step, then goes back', async () => {
        const { controller } = await startTour();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

        await act(() => controller.next());
        await act(() => controller.next());
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));

        expect(await screen.findByText('Second body')).toBeInTheDocument();
    });

    it('labels Next as Done on the last step and finishes the tour', async () => {
        const { controller } = await startTour();
        await act(() => controller.next());
        await act(() => controller.next());

        fireEvent.click(await screen.findByRole('button', { name: 'Done' }));

        await vi.waitFor(() => expect(controller.getSnapshot().runner.phase).toBe('idle'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('hides Next on press-to-advance steps unless showOnPress is set', async () => {
        const { controller } = await startTour();
        await act(() => controller.next());

        expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    });

    it('shows Next on press-to-advance steps with showOnPress', async () => {
        const { controller } = await startTour({ showOnPress: true });
        await act(() => controller.next());

        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    });

    it('skips from Skip and from Close', async () => {
        const { controller } = await startTour();
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
        expect(controller.getSnapshot().runner.phase).toBe('idle');

        await act(() => controller.startTour('tour'));
        fireEvent.click(screen.getByRole('button', { name: 'Close tour' }));
        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('runs a button handler before the step action', async () => {
        const onPress = vi.fn();
        const harness = createHarness({ tours: [tour], anchors: ['btn.press'] });
        render(
            <TourStep.Root>
                <TourStep.Skip onPress={onPress}>Leave</TourStep.Skip>
            </TourStep.Root>,
            { wrapper: harness.wrapper },
        );
        await act(() => harness.controller.startTour('tour'));

        fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

        expect(onPress).toHaveBeenCalledTimes(1);
        expect(harness.controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('renders custom labels and a progress render function', async () => {
        const harness = createHarness({ tours: [tour], anchors: ['btn.press'] });
        render(
            <TourStep.Root>
                <TourStep.Progress>{({ position, total }) => `${position} of ${total}`}</TourStep.Progress>
                <TourStep.Next nextLabel="Далее" doneLabel="Готово" />
            </TourStep.Root>,
            { wrapper: harness.wrapper },
        );
        await act(() => harness.controller.startTour('tour'));

        expect(screen.getByText('1 of 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument();
    });

    it('rejects parts rendered outside the root', () => {
        const { wrapper } = createHarness();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => render(<TourStep.Title />, { wrapper })).toThrow('inside <TourStep.Root>');
        error.mockRestore();
    });

    it('rejects the 0.1 index-based callbacks at compile time', () => {
        const rejected = [
            // @ts-expect-error `announce` was replaced by `announceStep`
            <TourStep.Root announce={(index: number, total: number, title: string) => `${index}/${total} ${title}`} />,
            // @ts-expect-error the render function takes `{ position, total }`, not `(index, total)`
            <TourStep.Progress>{(index: number, total: number) => `${index}/${total}`}</TourStep.Progress>,
        ];

        expect(rejected).toHaveLength(2);
    });
});
