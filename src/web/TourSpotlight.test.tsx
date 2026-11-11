import { act, fireEvent, render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestAdapter, defineTour } from '../core';
import { createHarness } from '../react/testHarness';
import { TourOverlay } from './TourOverlay';
import { TourPopover } from './TourPopover';
import { TourSpotlight } from './TourSpotlight';
import { createWebAdapter } from './adapter';
import { useTourAnchor } from './useTourAnchor';

const tour = defineTour({
    key: 'tour',
    title: 'Tour',
    steps: [
        { key: 'anchored', title: 'Anchored', body: 'Body', anchor: 'btn.target', placement: 'right' },
        { key: 'centered', title: 'Centered', body: 'Body' },
    ],
});

function Page({ children }: { children: ReactNode }) {
    return (
        <>
            <button data-sapar="btn.target">Target</button>
            {children}
        </>
    );
}

async function startTour(options: { compact?: boolean } = {}) {
    const adapter = createTestAdapter({ anchors: ['btn.target'], compact: options.compact });
    const harness = createHarness({ tours: [tour], adapter });
    await act(() => harness.controller.startTour('tour'));
    return harness;
}

const dimLayer = () => document.body.querySelector<SVGSVGElement>('svg[aria-hidden="true"]');
const dimPath = () => dimLayer()?.querySelector('path') as SVGPathElement;

afterEach(() => vi.restoreAllMocks());

describe('TourSpotlight', () => {
    it('renders nothing while no tour runs', () => {
        const { wrapper } = createHarness({ tours: [tour] });
        render(<TourSpotlight />, { wrapper });
        expect(dimLayer()).toBeNull();
    });

    it('cuts a hole around an anchored step', async () => {
        const { wrapper, controller } = await startTour();
        render(<Page><TourSpotlight /></Page>, { wrapper });
        await act(() => Promise.resolve());

        expect(dimLayer()).not.toHaveAttribute('data-centered');
        expect(dimPath().getAttribute('d')?.match(/M/g)).toHaveLength(2);
        expect(controller.getSnapshot().runner.phase).toBe('running');
    });

    it('draws only the dim layer for a centered step', async () => {
        const { wrapper, controller } = await startTour();
        render(<Page><TourSpotlight /></Page>, { wrapper });
        await act(() => controller.next());

        expect(dimLayer()).toHaveAttribute('data-centered');
        expect(dimPath().getAttribute('d')?.match(/M/g)).toHaveLength(1);
    });

    it('skips the tour when the dim layer is clicked', async () => {
        const { wrapper, recordProgress } = await startTour();
        render(<TourSpotlight />, { wrapper });

        fireEvent.click(dimPath());

        expect(dimLayer()).toBeNull();
        expect(recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dismissed' }));
    });

    it('hands the click to onClickOutside instead when given', async () => {
        const { wrapper, controller } = await startTour();
        const onClickOutside = vi.fn();
        render(<TourSpotlight onClickOutside={onClickOutside} />, { wrapper });

        fireEvent.click(dimPath());

        expect(onClickOutside).toHaveBeenCalledTimes(1);
        expect(controller.getSnapshot().runner.phase).toBe('running');
    });

    it('applies className and style to the layer', async () => {
        const { wrapper } = await startTour();
        render(<TourSpotlight className="text-black/50" style={{ zIndex: 7 }} />, { wrapper });

        expect(dimLayer()).toHaveClass('text-black/50');
        expect(dimLayer()).toHaveStyle({ zIndex: '7', position: 'fixed' });
    });

    it('disables the cutout transition under reduced motion', async () => {
        const harnessAdapter = createTestAdapter({ anchors: ['btn.target'], reducedMotion: true });
        const harness = createHarness({ tours: [tour], adapter: harnessAdapter });
        await act(() => harness.controller.startTour('tour'));
        render(<TourSpotlight />, { wrapper: harness.wrapper });

        expect(dimPath()).toHaveStyle({ transitionProperty: 'none' });
    });
});

describe('TourPopover', () => {
    const popover = () => document.body.querySelector<HTMLElement>('[data-popover]');

    it('positions next to an anchored step and reports its placement', async () => {
        const { wrapper } = await startTour();
        render(<Page><TourPopover className="card"><span data-popover /></TourPopover></Page>, { wrapper });
        await act(() => Promise.resolve());

        const container = popover()?.parentElement;
        expect(container).toHaveClass('card');
        expect(container).toHaveAttribute('data-placement', 'right');
        expect(container).not.toHaveAttribute('data-centered');
        expect(container).not.toHaveAttribute('data-compact');
        expect(container).toHaveAttribute('data-presentation', 'anchored');
    });

    it('is centered for a step without an anchor', async () => {
        const { wrapper, controller } = await startTour();
        render(<Page><TourPopover><span data-popover /></TourPopover></Page>, { wrapper });
        await act(() => controller.next());

        const container = popover()?.parentElement;
        expect(container).toHaveAttribute('data-centered');
        expect(container).not.toHaveAttribute('data-placement');
    });

    it('becomes a bottom sheet on compact screens', async () => {
        const { wrapper } = await startTour({ compact: true });
        render(<Page><TourPopover><span data-popover /></TourPopover></Page>, { wrapper });

        const container = popover()?.parentElement;
        expect(container).toHaveAttribute('data-compact');
        expect(container).toHaveAttribute('data-presentation', 'sheet');
        expect(container).toHaveStyle({ position: 'fixed', bottom: '0px' });
    });

    it('is a bottom sheet on wide screens when asked for one', async () => {
        const { wrapper } = await startTour();
        render(<Page><TourPopover presentation="sheet"><span data-popover /></TourPopover></Page>, { wrapper });

        const container = popover()?.parentElement;
        expect(container).toHaveAttribute('data-presentation', 'sheet');
        expect(container).toHaveStyle({ position: 'fixed', bottom: '0px' });
    });

    it('stays next to the anchor on compact screens when asked to', async () => {
        const { wrapper } = await startTour({ compact: true });
        render(<Page><TourPopover presentation="anchored"><span data-popover /></TourPopover></Page>, { wrapper });
        await act(() => Promise.resolve());

        const container = popover()?.parentElement;
        expect(container).toHaveAttribute('data-presentation', 'anchored');
        expect(container).toHaveAttribute('data-placement', 'right');
        expect(container).not.toHaveAttribute('data-compact');
    });

    it('follows a presentation change on the next render', async () => {
        const { wrapper } = await startTour({ compact: true });
        const { rerender } = render(<Page><TourPopover><span data-popover /></TourPopover></Page>, { wrapper });
        expect(popover()?.parentElement).toHaveAttribute('data-presentation', 'sheet');

        rerender(<Page><TourPopover presentation="anchored"><span data-popover /></TourPopover></Page>);

        expect(popover()?.parentElement).toHaveAttribute('data-presentation', 'anchored');
    });
});

describe('TourOverlay', () => {
    it('renders nothing without a running tour', () => {
        const { wrapper } = createHarness({ tours: [tour] });
        render(<TourOverlay><p>card</p></TourOverlay>, { wrapper });
        expect(document.body.textContent).toBe('');
    });

    it('passes the presentation on to the popover', async () => {
        const { wrapper } = await startTour();
        render(<Page><TourOverlay presentation="sheet"><p data-popover>card</p></TourOverlay></Page>, { wrapper });

        expect(document.body.querySelector('[data-popover]')?.parentElement).toHaveAttribute('data-presentation', 'sheet');
    });

    it('accepts a render function and plain children', async () => {
        const { wrapper } = await startTour();
        const { unmount } = render(<Page><TourOverlay>{(tourStep) => <p>{tourStep.step.title}</p>}</TourOverlay></Page>, { wrapper });
        expect(document.body).toHaveTextContent('Anchored');
        expect(dimLayer()).not.toBeNull();
        unmount();

        render(<Page><TourOverlay><p>static card</p></TourOverlay></Page>, { wrapper });
        expect(document.body).toHaveTextContent('static card');
    });
});

describe('an anchor that disappears', () => {
    const laneTour = defineTour({
        key: 'lanes',
        title: 'Lanes',
        steps: [
            { key: 'button', title: 'Button', body: 'Body', anchor: 'btn.target' },
            { key: 'lane', title: 'Lane', body: 'Body', anchor: 'lane.first' },
            { key: 'done', title: 'Done', body: 'Body' },
        ],
    });

    function HookLane() {
        return <div {...useTourAnchor('lane.first')}>lane</div>;
    }

    let finishLoading: () => void;

    // Owns its own state, so removing the lane re-renders nothing that draws the tour.
    function Lane({ spelling }: { spelling: 'useTourAnchor' | 'data-sapar' }) {
        const [loaded, setLoaded] = useState(false);
        finishLoading = () => setLoaded(true);
        if (loaded) return null;
        return spelling === 'useTourAnchor' ? <HookLane /> : <div data-sapar="lane.first">lane</div>;
    }

    async function startOnPage(spelling: 'useTourAnchor' | 'data-sapar') {
        const adapter = createWebAdapter({ navigate: () => {}, currentRoute: () => '/' });
        const harness = createHarness({ tours: [laneTour], adapter });
        render(
            <>
                <button data-sapar="btn.target">Target</button>
                <Lane spelling={spelling} />
                <TourSpotlight />
                <TourPopover><span data-popover /></TourPopover>
            </>,
            { wrapper: harness.wrapper },
        );
        await act(() => harness.controller.startTour('lanes'));
        return harness;
    }

    const popoverContainer = () => document.body.querySelector('[data-popover]')?.parentElement;
    const removeLane = () => act(async () => finishLoading());

    describe.each(['useTourAnchor', 'data-sapar'] as const)('marked with %s', (spelling) => {
        it('drops the hole and centers the card when it goes while its step is shown', async () => {
            const { controller } = await startOnPage(spelling);
            await act(() => controller.next());
            expect(dimLayer()).not.toHaveAttribute('data-centered');
            expect(popoverContainer()).toHaveAttribute('data-placement');

            await removeLane();

            expect(controller.getSnapshot().runner.index).toBe(1);
            expect(dimLayer()).toHaveAttribute('data-centered');
            expect(dimPath().getAttribute('d')?.match(/M/g)).toHaveLength(1);
            expect(popoverContainer()).toHaveAttribute('data-centered');
            expect(popoverContainer()).not.toHaveAttribute('data-placement');
        });

        it('is skipped on arrival and leaves no hole from the previous step on the centered one', async () => {
            const { controller } = await startOnPage(spelling);
            expect(dimLayer()).not.toHaveAttribute('data-centered');
            await removeLane();

            await act(() => controller.next());

            expect(controller.getSnapshot().runner).toMatchObject({ index: 2, skipped: ['lane'] });
            expect(dimLayer()).toHaveAttribute('data-centered');
            expect(dimPath().getAttribute('d')?.match(/M/g)).toHaveLength(1);
            expect(popoverContainer()).toHaveAttribute('data-centered');
        });
    });
});
