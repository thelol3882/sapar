import { describe, expect, it, vi } from 'vitest';
import { deferred, makeTour } from './fixtures';
import { createTourMachine } from './machine';
import { createTestAdapter } from './testing';
import type { StepInput } from './define';
import type { TestAdapterOptions } from './testing';

function setup(adapterOptions: TestAdapterOptions = {}, machineOptions: { locales?: string[] } = {}) {
    const adapter = createTestAdapter(adapterOptions);
    const events = { onProgress: vi.fn(), onError: vi.fn() };
    const machine = createTourMachine(adapter, events, { anchorTimeoutMs: 20, presentAnchorTimeoutMs: 5, ...machineOptions });
    return { adapter, events, machine };
}

const step = (key: string, extra: Partial<StepInput> = {}): StepInput => ({ key, title: key, body: key, ...extra });

const twoSteps = makeTour('tour1', { revision: 2, steps: [step('intro'), step('panel', { anchor: 'panel' })] });

describe('start', () => {
    it('runs and reports started with the revision', async () => {
        const { machine, events } = setup({ anchors: ['panel'] });

        await machine.start(twoSteps, { autoStarted: true });

        expect(machine.getSnapshot()).toMatchObject({ phase: 'running', tour: twoSteps, index: 0, autoStarted: true });
        expect(events.onProgress).toHaveBeenCalledWith({
            key: 'tour1',
            revision: 2,
            status: 'started',
            stepIndex: 0,
            autoStarted: true,
        });
    });

    it('goes idle silently when every step is skipped', async () => {
        const { machine, events } = setup();
        const tour = makeTour('t', { steps: [step('only', { anchor: 'missing' })] });

        await machine.start(tour, { autoStarted: false });

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).not.toHaveBeenCalled();
    });

    it('goes idle silently when the first step is required and missing', async () => {
        const { machine, events } = setup();
        const tour = makeTour('t', { steps: [step('a', { anchor: 'missing', required: true }), step('b')] });

        await machine.start(tour, { autoStarted: false });

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).not.toHaveBeenCalled();
    });

    it('shows the first step at once and peeks later anchors without waiting', async () => {
        const { machine, adapter } = setup({ anchors: ['a'], delayedAnchors: ['b', 'c'] });
        const tour = makeTour('t', {
            steps: [step('one', { anchor: 'a' }), step('two', { anchor: 'b' }), step('three', { anchor: 'c' })],
        });

        await machine.start(tour, { autoStarted: false });

        expect(machine.getSnapshot()).toMatchObject({ phase: 'running', index: 0, skipped: ['two', 'three'] });
        expect(adapter.resolveRequests).toEqual([
            { key: 'a', timeoutMs: 5 },
            { key: 'b', timeoutMs: 0 },
            { key: 'c', timeoutMs: 0 },
        ]);
    });

    it('starts on the first viable step when leading steps are missing', async () => {
        const { machine, events } = setup({ anchors: ['panel'] });
        const tour = makeTour('t', { steps: [step('a', { anchor: 'gone' }), step('b', { anchor: 'panel' })] });

        await machine.start(tour, { autoStarted: false });

        expect(machine.getSnapshot()).toMatchObject({ index: 1, skipped: ['a'] });
        expect(events.onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'started', stepIndex: 1 }));
    });

    it('scrolls the first anchored step into view honouring reduced motion', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'], reducedMotion: true });
        const tour = makeTour('t', { steps: [step('a', { anchor: 'panel' })] });

        await machine.start(tour, { autoStarted: false });

        expect(adapter.scrolls).toEqual([{ handle: adapter.anchors.get('panel'), reducedMotion: true }]);
    });

    it('abandons without reporting when the adapter rejects', async () => {
        const { machine, adapter, events } = setup({ anchors: ['panel'] });
        const failure = new Error('boom');
        adapter.scrollIntoView = () => Promise.reject(failure);
        const tour = makeTour('t', { steps: [step('a', { anchor: 'panel' })] });

        await machine.start(tour, { autoStarted: false });

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).not.toHaveBeenCalled();
        expect(events.onError).toHaveBeenCalledWith(failure, 'tour machine');
    });
});

describe('next, previous, finish, skip', () => {
    it('moves without reporting, and refuses to go before the first step', async () => {
        const { machine, events } = setup({ anchors: ['panel'] });
        await machine.start(twoSteps, { autoStarted: false });
        events.onProgress.mockClear();

        await machine.next();
        expect(machine.getSnapshot().index).toBe(1);
        await machine.previous();
        await machine.previous();

        expect(machine.getSnapshot().index).toBe(0);
        expect(events.onProgress).not.toHaveBeenCalled();
    });

    it('completes when advancing past the last step', async () => {
        const { machine, events } = setup({ anchors: ['panel'] });
        await machine.start(twoSteps, { autoStarted: false });

        await machine.next();
        await machine.next();

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).toHaveBeenLastCalledWith({
            key: 'tour1',
            revision: 2,
            status: 'completed',
            stepIndex: 1,
            autoStarted: false,
        });
    });

    it('completes when every later step is missing', async () => {
        const { machine, events } = setup();
        const tour = makeTour('t', { steps: [step('a'), step('b', { anchor: 'gone' })] });
        await machine.start(tour, { autoStarted: false });

        await machine.next();

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed', stepIndex: 0 }));
    });

    it('dismisses on skip at the current step', async () => {
        const { machine, events } = setup({ anchors: ['panel'] });
        await machine.start(twoSteps, { autoStarted: false });
        await machine.next();

        machine.skip();

        expect(events.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dismissed', stepIndex: 1 }));
    });

    it('ignores skip and finish when nothing runs', () => {
        const { machine, events } = setup();

        machine.skip();
        machine.finish();

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).not.toHaveBeenCalled();
    });
});

describe('missing anchors on arrival', () => {
    const threeSteps = makeTour('t', {
        steps: [step('a'), step('b', { anchor: 'b' }), step('c', { anchor: 'c', required: true }), step('d')],
    });

    it('skips a step whose element unmounted after the start, in the direction of travel', async () => {
        const { machine, adapter } = setup({ anchors: ['b', 'c'] });
        const tour = makeTour('t', { steps: [step('a'), step('b', { anchor: 'b' }), step('c', { anchor: 'c' })] });
        await machine.start(tour, { autoStarted: false });
        expect(machine.getSnapshot().skipped).toEqual([]);

        adapter.hideAnchor('b');
        await machine.next();

        expect(machine.getSnapshot()).toMatchObject({ index: 2, skipped: ['b'] });
        expect(adapter.scrolls.map(({ handle }) => handle.key)).toEqual(['c']);

        await machine.previous();

        expect(machine.getSnapshot()).toMatchObject({ index: 0, skipped: ['b'] });
    });

    it('stays put when no earlier step is viable', async () => {
        const { machine, adapter } = setup({ anchors: ['b', 'c'] });
        const tour = makeTour('t', { steps: [step('a', { anchor: 'a' }), step('b', { anchor: 'b' })] });
        adapter.showAnchor('a');
        await machine.start(tour, { autoStarted: false });
        await machine.next();
        adapter.hideAnchor('a');
        const before = machine.getSnapshot();

        await machine.previous();

        expect(machine.getSnapshot()).toBe(before);
    });

    it('keeps listening for a press on the current step after staying put', async () => {
        const { machine, adapter } = setup({ anchors: ['a'] });
        const tour = makeTour('t', { steps: [step('a', { anchor: 'a', advanceOn: 'press' }), step('b')] });
        await machine.start(tour, { autoStarted: false });

        await machine.previous();

        expect(adapter.anchors.get('a')?.pressListenerCount()).toBe(1);
    });

    it('aborts silently when a required step is missing on arrival, leaving the tour offerable', async () => {
        const { machine, events } = setup({ anchors: ['b'] });
        await machine.start(threeSteps, { autoStarted: false });
        await machine.next();
        events.onProgress.mockClear();

        await machine.next();

        expect(machine.getSnapshot().phase).toBe('idle');
        expect(events.onProgress).not.toHaveBeenCalled();
    });

    it('waits only the short timeout for a step on the page the user is already on', async () => {
        const { machine, adapter } = setup({ delayedAnchors: ['b'] });
        const tour = makeTour('t', { steps: [step('a'), step('b', { anchor: 'b' })] });
        await machine.start(tour, { autoStarted: false });
        adapter.resolveRequests.length = 0;

        await machine.next();

        expect(adapter.resolveRequests).toEqual([{ key: 'b', timeoutMs: 5 }]);
        expect(machine.getSnapshot().phase).toBe('idle');
    });
});

describe('navigation', () => {
    const routed = makeTour('nav', {
        steps: [step('intro'), step('panel', { anchor: 'panel', route: '/settings' })],
    });

    it('navigates, re-resolves the anchor, then scrolls', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'], route: '/' });
        await machine.start(routed, { autoStarted: false });
        const before = adapter.anchors.get('panel');
        adapter.hideAnchor('panel');
        const fresh = adapter.showAnchor('panel');

        await machine.next();

        expect(adapter.navigations).toEqual(['/settings']);
        expect(fresh).not.toBe(before);
        expect(machine.getSnapshot().handle).toBe(fresh);
        expect(adapter.scrolls.at(-1)?.handle).toBe(fresh);
    });

    it('waits the long timeout only after navigating', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'], route: '/' });
        await machine.start(routed, { autoStarted: false });
        adapter.resolveRequests.length = 0;

        await machine.next();

        expect(adapter.resolveRequests).toEqual([{ key: 'panel', timeoutMs: 20 }]);
    });

    it('does not navigate when already on the route, comparing normalized forms', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'], route: '/ru/settings/?x=1' }, { locales: ['ru'] });
        await machine.start(routed, { autoStarted: false });

        await machine.next();

        expect(adapter.navigations).toEqual([]);
    });
});

describe('stale transitions', () => {
    it('drops a superseded transition instead of rewinding', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'], route: '/' });
        const tour = makeTour('race', {
            steps: [step('intro'), step('panel', { anchor: 'panel', route: '/next' })],
        });
        await machine.start(tour, { autoStarted: false });
        const [first, second] = [deferred(), deferred()];
        const navigations = [first, second];
        adapter.navigate = () => navigations.shift()!.promise;

        const staleNext = machine.next();
        const winningNext = machine.next();
        second.resolve();
        await winningNext;
        first.resolve();
        await staleNext;

        expect(machine.getSnapshot()).toMatchObject({ phase: 'running', index: 1 });
    });

    it('does not resurrect a tour skipped during a transition', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'], route: '/' });
        const tour = makeTour('race', {
            steps: [step('intro'), step('panel', { anchor: 'panel', route: '/next' })],
        });
        await machine.start(tour, { autoStarted: false });
        const navigation = deferred();
        adapter.navigate = () => navigation.promise;

        const pending = machine.next();
        machine.skip();
        navigation.resolve();
        await pending;

        expect(machine.getSnapshot().phase).toBe('idle');
    });
});

describe('advanceOn press', () => {
    const pressTour = makeTour('press', {
        steps: [step('a', { anchor: 'a', advanceOn: 'press' }), step('b', { anchor: 'b', advanceOn: 'press' }), step('c')],
    });

    it('advances when the anchored element is pressed and listens only to the current step', async () => {
        const { machine, adapter } = setup({ anchors: ['a', 'b'] });
        await machine.start(pressTour, { autoStarted: false });
        const [a, b] = [adapter.anchors.get('a')!, adapter.anchors.get('b')!];
        expect([a.pressListenerCount(), b.pressListenerCount()]).toEqual([1, 0]);

        a.press();
        await vi.waitFor(() => expect(machine.getSnapshot().index).toBe(1));

        expect([a.pressListenerCount(), b.pressListenerCount()]).toEqual([0, 1]);
    });

    it('unsubscribes on skip, finish and destroy', async () => {
        for (const leave of ['skip', 'finish', 'destroy'] as const) {
            const { machine, adapter } = setup({ anchors: ['a', 'b'] });
            await machine.start(pressTour, { autoStarted: false });

            machine[leave]();

            expect(adapter.anchors.get('a')?.pressListenerCount()).toBe(0);
        }
    });

    it('unsubscribes while a transition is in flight', async () => {
        const { machine, adapter } = setup({ anchors: ['a', 'b'] });
        await machine.start(pressTour, { autoStarted: false });
        const pending = deferred();
        adapter.scrollIntoView = () => pending.promise;

        const moving = machine.next();

        expect(adapter.anchors.get('a')?.pressListenerCount()).toBe(0);
        pending.resolve();
        await moving;
    });

    it('does not listen on steps with the default advance mode', async () => {
        const { machine, adapter } = setup({ anchors: ['panel'] });

        await machine.start(twoSteps, { autoStarted: false });
        await machine.next();

        expect(adapter.anchors.get('panel')?.pressListenerCount()).toBe(0);
    });
});

describe('snapshots and subscriptions', () => {
    it('keeps the snapshot reference until state changes and notifies once per commit', async () => {
        const { machine } = setup({ anchors: ['panel'] });
        const listener = vi.fn();
        machine.subscribe(listener);
        const idle = machine.getSnapshot();
        expect(machine.getSnapshot()).toBe(idle);

        await machine.start(twoSteps, { autoStarted: false });

        expect(machine.getSnapshot()).not.toBe(idle);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('turns every call into a no-op after destroy', async () => {
        const { machine, events } = setup({ anchors: ['panel'] });
        await machine.start(twoSteps, { autoStarted: false });
        const before = machine.getSnapshot();
        const listener = vi.fn();
        machine.destroy();
        events.onProgress.mockClear();

        await machine.next();
        machine.skip();
        await machine.start(twoSteps, { autoStarted: true });
        machine.subscribe(listener)();

        expect(machine.getSnapshot()).toBe(before);
        expect(events.onProgress).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });
});
