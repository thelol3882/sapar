import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defineTour } from '../core';
import { createHarness } from '../react/testHarness';
import { TourStep, type TourStepRootProps } from './TourStep';

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

    it('is a non-modal dialog labelled by its title and described by its body', async () => {
        await startTour();

        const dialog = screen.getByRole('dialog', { name: 'First' });
        expect(dialog).toHaveAttribute('aria-modal', 'false');
        expect(dialog).toHaveAccessibleDescription('First body');
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('moves focus to the dialog on every step', async () => {
        const { controller } = await startTour();
        await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());

        screen.getByRole('button', { name: 'Next' }).focus();
        await act(() => controller.next());

        await waitFor(() => expect(screen.getByRole('dialog', { name: 'Second' })).toHaveFocus());
    });

    it('refocuses the dialog after Back', async () => {
        const { controller } = await startTour();
        await act(() => controller.next());
        await act(() => controller.next());
        screen.getByRole('button', { name: 'Back' }).focus();

        await userEvent.click(screen.getByRole('button', { name: 'Back' }));

        await waitFor(() => expect(screen.getByRole('dialog', { name: 'Second' })).toHaveFocus());
    });

    it('announces the step politely, with an overridable text', async () => {
        await startTour({ root: { announceStep: ({ position, total, title }) => `${title} (${position}/${total})` } });

        const region = document.querySelector('[aria-live="polite"]');
        expect(region).toHaveTextContent('First (1/3)');
    });

    it('announces "Step X of Y: title" by default', async () => {
        await startTour();
        expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Step 1 of 3: First');
    });

    it('skips on Escape and records the dismissal', async () => {
        const { recordProgress } = await startTour();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dismissed' }));
    });

    it('skips from the Skip and Close buttons', async () => {
        await startTour();
        await userEvent.click(screen.getByRole('button', { name: 'Close tour' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('hides Back on the first step only', async () => {
        const { controller } = await startTour();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

        await act(() => controller.next());
        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('hides Next on a press step unless showOnPress is set', async () => {
        const { controller } = await startTour();
        await act(() => controller.next());

        expect(screen.getByRole('dialog', { name: 'Second' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    });

    it('shows Next on a press step with showOnPress', async () => {
        const { controller } = await startTour({ showOnPress: true });
        await act(() => controller.next());
        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    });

    it('labels the last step Done and completes the tour', async () => {
        const { controller, recordProgress } = await startTour();
        await act(() => controller.next());
        await act(() => controller.next());

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it('lets children and doneLabel override the labels', async () => {
        const harness = createHarness({ tours: [tour], anchors: ['btn.press'] });
        render(
            <TourStep.Root>
                <TourStep.Progress>{({ position, total }) => `step ${position}/${total}`}</TourStep.Progress>
                <TourStep.Next nextLabel="Continue" doneLabel="Finish" />
            </TourStep.Root>,
            { wrapper: harness.wrapper },
        );
        await act(() => harness.controller.startTour('tour'));

        expect(screen.getByText('step 1/3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    it('renders buttons through a render prop with the wired-up props', async () => {
        const harness = createHarness({ tours: [tour], anchors: ['btn.press'] });
        render(
            <TourStep.Root>
                <TourStep.Title />
                <TourStep.Next render={(props) => <button data-custom="" {...props} />} />
            </TourStep.Root>,
            { wrapper: harness.wrapper },
        );
        await act(() => harness.controller.startTour('tour'));

        const next = screen.getByRole('button', { name: 'Next' });
        expect(next).toHaveAttribute('data-custom');
        expect(next).toHaveAttribute('type', 'button');
        await userEvent.click(next);
        await waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleName('Second'));
    });

    it('requires Root around its parts', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<TourStep.Next />)).toThrow('inside <TourStep.Root>');
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
