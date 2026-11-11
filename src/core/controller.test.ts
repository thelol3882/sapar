import { describe, expect, it, vi } from 'vitest';
import { createSaparController } from './controller';
import { EMPTY_INBOX, deferred, flush, makeAnnouncement, makeSource, makeTour } from './fixtures';
import { createTestAdapter } from './testing';
import type { Inbox, Interruption, SaparControllerOptions } from './types';

function setup(options: Partial<SaparControllerOptions> & { anchors?: string[]; delayedAnchors?: string[] } = {}) {
    const { anchors = [], delayedAnchors, ...controllerOptions } = options;
    const source = makeSource();
    const adapter = createTestAdapter({ anchors, delayedAnchors });
    const onError = vi.fn();
    const controller = createSaparController({
        source,
        adapter,
        onError,
        anchorTimeoutMs: 20,
        presentAnchorTimeoutMs: 5,
        autoStartTimeoutMs: 30,
        ...controllerOptions,
    });
    return { source, adapter, onError, controller };
}

const inboxWith = (interruption: Interruption | null, extra: Partial<Inbox> = {}): Inbox => ({
    ...EMPTY_INBOX,
    interruption,
    ...extra,
});

const tourOffer = (key = 'welcome'): Interruption => ({ kind: 'tour', tour: makeTour(key) });

const anchoredTour = (key: string, anchor: string) =>
    makeTour(key, { steps: [{ key: 'a', title: 'A', body: 'B' }, { key: 'b', title: 'B', body: 'B', anchor }] });

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('inbox', () => {
    it('loads on setRoute with the normalized route and platform', async () => {
        const { controller, source } = setup({ locales: ['ru'] });
        source.getInbox.mockResolvedValue(inboxWith(null, { unreadCount: 2 }));

        controller.setRoute('/ru/billing/?tab=1');
        expect(controller.getSnapshot().inboxStatus).toBe('loading');
        await flush();

        expect(source.getInbox).toHaveBeenCalledWith({ route: '/billing', platform: 'web' });
        expect(controller.getSnapshot()).toMatchObject({ inboxStatus: 'ready', inbox: { unreadCount: 2 } });
    });

    it('sends no route for setRoute(undefined)', async () => {
        const { controller, source } = setup();

        controller.setRoute(undefined);
        await flush();

        expect(source.getInbox).toHaveBeenCalledWith({ route: undefined, platform: 'web' });
    });

    it('reports a failed fetch as an error state', async () => {
        const { controller, source, onError } = setup();
        const failure = new Error('offline');
        source.getInbox.mockRejectedValue(failure);

        await controller.refresh();

        expect(controller.getSnapshot().inboxStatus).toBe('error');
        expect(onError).toHaveBeenCalledWith(failure, 'inbox');
    });

    it('ignores a stale response when the route changed quickly', async () => {
        const { controller, source } = setup();
        const slow = deferred<Inbox>();
        const fast = deferred<Inbox>();
        source.getInbox.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

        controller.setRoute('/a');
        controller.setRoute('/b');
        fast.resolve(inboxWith(null, { unreadCount: 2 }));
        await flush();
        slow.resolve(inboxWith(null, { unreadCount: 1 }));
        await flush();

        expect(controller.getSnapshot().inbox?.unreadCount).toBe(2);
    });

    it('returns a stable snapshot until something changes and notifies subscribers', async () => {
        const { controller } = setup();
        const listener = vi.fn();
        controller.subscribe(listener);
        const initial = controller.getSnapshot();
        expect(controller.getSnapshot()).toBe(initial);

        await controller.refresh();

        expect(controller.getSnapshot()).not.toBe(initial);
        expect(listener).toHaveBeenCalled();
    });

    it('stops everything after destroy', async () => {
        const { controller, source } = setup();
        const listener = vi.fn();
        controller.subscribe(listener);

        controller.destroy();
        await controller.refresh();

        expect(source.getInbox).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('anchor timeouts', () => {
    it('defaults to 300 ms on a rendered page and 3000 ms after navigating', async () => {
        const source = makeSource();
        const adapter = createTestAdapter({ anchors: ['here', 'there'] });
        const controller = createSaparController({ source, adapter });
        const tour = makeTour('t', {
            steps: [
                { key: 'a', title: 'A', body: 'B', anchor: 'here' },
                { key: 'b', title: 'B', body: 'B', anchor: 'there', route: '/other' },
            ],
        });

        await controller.startTour(tour);
        await controller.next();

        expect(adapter.resolveRequests).toEqual([
            { key: 'here', timeoutMs: 300 },
            { key: 'there', timeoutMs: 3000 },
        ]);
    });
});

describe('auto-starting a tour interruption', () => {
    it('starts it once, as auto-started, and reports progress', async () => {
        const { controller, source } = setup();
        source.getInbox.mockResolvedValue(inboxWith(tourOffer()));

        controller.setRoute('/a');
        await flush();
        controller.setRoute('/b');
        await flush();

        expect(controller.getSnapshot().runner).toMatchObject({ phase: 'running', autoStarted: true });
        expect(source.recordProgress).toHaveBeenCalledTimes(1);
        expect(source.recordProgress).toHaveBeenCalledWith({
            key: 'welcome',
            revision: 1,
            status: 'started',
            stepIndex: 0,
            autoStarted: true,
        });
    });

    it('does not retry a tour that aborted after it started, even though the runner is idle again', async () => {
        const { controller, source, adapter } = setup({ anchors: ['present'] });
        const fragile = makeTour('fragile', {
            steps: [
                { key: 'a', title: 'A', body: 'B', anchor: 'present' },
                { key: 'b', title: 'B', body: 'B', anchor: 'missing', required: true },
            ],
        });
        source.getInbox.mockResolvedValue(inboxWith({ kind: 'tour', tour: fragile }));
        await controller.refresh();
        await flush();
        await controller.next();
        source.recordProgress.mockClear();

        await controller.refresh();
        await flush();

        expect(controller.getSnapshot().runner.phase).toBe('idle');
        expect(source.recordProgress).not.toHaveBeenCalled();
        expect(adapter.resolveRequests.filter(({ key }) => key === 'present')).toHaveLength(2);
    });

    it('does not start while another tour runs', async () => {
        const { controller, source } = setup();
        await controller.startTour(makeTour('manual_one'));
        source.getInbox.mockResolvedValue(inboxWith(tourOffer()));

        await controller.refresh();

        expect(controller.getSnapshot().runner.tour?.key).toBe('manual_one');
    });

    it('spends the session cap when the tour starts, blocking later offers', async () => {
        const first = setup();
        first.source.getInbox.mockResolvedValue(inboxWith(tourOffer()));
        await first.controller.refresh();
        await flush();
        const secondSource = makeSource();
        secondSource.getInbox.mockResolvedValue(inboxWith(tourOffer('other')));
        const sameSession = createSaparController({ source: secondSource, adapter: first.adapter });

        await sameSession.refresh();
        await flush();

        expect(sameSession.getSnapshot().inbox?.interruption).toBeNull();
        expect(sameSession.getSnapshot().runner.phase).toBe('idle');
    });

    it('does not spend the cap for a tour that never showed', async () => {
        const { controller, source, adapter } = setup();
        source.getInbox.mockResolvedValue(inboxWith({ kind: 'tour', tour: anchoredTour('blocked', 'missing') }));

        await controller.refresh();
        await delay(40);

        expect(adapter.sessionValues.size).toBe(0);
    });

    it('ignores the cap when sessionCap is false', async () => {
        const first = setup({ sessionCap: false });
        first.source.getInbox.mockResolvedValue(inboxWith(tourOffer()));
        await first.controller.refresh();
        await flush();
        const again = createSaparController({
            source: first.source,
            adapter: first.adapter,
            sessionCap: false,
            anchorTimeoutMs: 20,
        });
        first.source.getInbox.mockResolvedValue(inboxWith(tourOffer('other')));

        await again.refresh();
        await flush();

        expect(again.getSnapshot().runner.tour?.key).toBe('other');
        expect(first.adapter.sessionValues.size).toBe(0);
    });
});

describe('auto-start gate', () => {
    const offer = (anchor: string): Inbox => inboxWith({ kind: 'tour', tour: anchoredTour('gated', anchor) });

    it('shows nothing until the first anchored step appears, then starts as auto-started', async () => {
        const { controller, source, adapter } = setup({ delayedAnchors: ['board.new_job'] });
        source.getInbox.mockResolvedValue(offer('board.new_job'));

        await controller.refresh();
        expect(controller.getSnapshot().runner.phase).toBe('idle');
        expect(adapter.resolveRequests).toEqual([{ key: 'board.new_job', timeoutMs: 30 }]);

        adapter.showAnchor('board.new_job');
        await vi.waitFor(() => expect(controller.getSnapshot().runner).toMatchObject({ phase: 'running', autoStarted: true }));
        expect(source.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ key: 'gated', status: 'started' }));
    });

    it('does not start a second wait while the first is pending', async () => {
        const { controller, source, adapter } = setup({ delayedAnchors: ['board.new_job'] });
        source.getInbox.mockResolvedValue(offer('board.new_job'));

        await controller.refresh();
        await controller.refresh();

        expect(adapter.resolveRequests).toHaveLength(1);
    });

    it('gives up silently, spends nothing and tries again on a later visit', async () => {
        const { controller, source, adapter } = setup({ delayedAnchors: ['board.new_job'] });
        source.getInbox.mockResolvedValue(offer('board.new_job'));
        await controller.refresh();

        await delay(40);

        expect(controller.getSnapshot().runner.phase).toBe('idle');
        expect(source.recordProgress).not.toHaveBeenCalled();
        expect(adapter.sessionValues.size).toBe(0);

        await controller.refresh();
        adapter.showAnchor('board.new_job');
        await vi.waitFor(() => expect(controller.getSnapshot().runner.phase).toBe('running'));
        expect(adapter.sessionValues.size).toBe(1);
    });

    it('does not wait for a tour without anchors', async () => {
        const { controller, source, adapter } = setup();
        source.getInbox.mockResolvedValue(inboxWith(tourOffer()));

        await controller.refresh();
        await flush();

        expect(controller.getSnapshot().runner.phase).toBe('running');
        expect(adapter.resolveRequests).toEqual([]);
    });

    it('does not wait for a first anchor that lives on another route', async () => {
        const { controller, source, adapter } = setup();
        const tour = makeTour('far', { steps: [{ key: 'a', title: 'A', body: 'B', anchor: 'far.away', route: '/other' }] });
        source.getInbox.mockResolvedValue(inboxWith({ kind: 'tour', tour }));

        await controller.refresh();
        await flush();

        expect(adapter.navigations).toEqual(['/other']);
        expect(adapter.resolveRequests).toEqual([{ key: 'far.away', timeoutMs: 20 }]);
    });

    it('drops the start when another tour began meanwhile, and releases the guard', async () => {
        const { controller, source, adapter } = setup({ delayedAnchors: ['board.new_job'] });
        source.getInbox.mockResolvedValue(offer('board.new_job'));
        await controller.refresh();

        await controller.startTour(makeTour('manual_one'));
        adapter.showAnchor('board.new_job');
        await flush();

        expect(controller.getSnapshot().runner.tour?.key).toBe('manual_one');
        expect(source.recordProgress).toHaveBeenCalledTimes(1);
    });

    it('does not gate a manual start', async () => {
        const { controller, adapter } = setup({ delayedAnchors: ['board.new_job'] });

        await controller.startTour(anchoredTour('manual_gate', 'board.new_job'));

        expect(controller.getSnapshot().runner).toMatchObject({ phase: 'running', index: 0 });
        expect(adapter.resolveRequests).toEqual([{ key: 'board.new_job', timeoutMs: 0 }]);
    });
});

describe('announcement interruptions', () => {
    const modal = (key: string): Interruption => ({
        kind: 'announcement',
        announcement: makeAnnouncement(key, { tier: 'modal' }),
    });

    it('is not auto-shown by the runner but stays in the inbox, spending the cap', async () => {
        const { controller, source, adapter } = setup();
        source.getInbox.mockResolvedValue(inboxWith(modal('news')));

        await controller.refresh();

        expect(controller.getSnapshot().inbox?.interruption).toMatchObject({ kind: 'announcement' });
        expect(controller.getSnapshot().runner.phase).toBe('idle');
        expect(adapter.sessionValues.size).toBe(1);
    });

    it('keeps showing the surfaced announcement on refresh but drops any other one', async () => {
        const { controller, source } = setup();
        source.getInbox.mockResolvedValue(inboxWith(modal('news')));
        await controller.refresh();

        await controller.refresh();
        expect(controller.getSnapshot().inbox?.interruption).toMatchObject({ announcement: { key: 'news' } });

        source.getInbox.mockResolvedValue(inboxWith(modal('another')));
        await controller.refresh();
        expect(controller.getSnapshot().inbox?.interruption).toBeNull();
    });

    it('drops an announcement when the session slot is already spent', async () => {
        const { controller, source, adapter } = setup();
        adapter.sessionValues.set('sapar.session-interruption-spent', '1');
        source.getInbox.mockResolvedValue(inboxWith(modal('news')));

        await controller.refresh();

        expect(controller.getSnapshot().inbox?.interruption).toBeNull();
    });

    it('clears it locally on dismiss, tells the source and refreshes', async () => {
        const { controller, source } = setup();
        source.getInbox.mockResolvedValueOnce(inboxWith(modal('news')));
        await controller.refresh();
        source.getInbox.mockResolvedValue(inboxWith(null));

        await controller.dismiss('news');

        expect(source.dismiss).toHaveBeenCalledWith('news');
        expect(source.getInbox).toHaveBeenCalledTimes(2);
        expect(controller.getSnapshot().inbox?.interruption).toBeNull();
    });

    it('reports a failed dismiss', async () => {
        const { controller, source, onError } = setup();
        const failure = new Error('nope');
        source.dismiss.mockRejectedValue(failure);

        await controller.dismiss('news');

        expect(onError).toHaveBeenCalledWith(failure, 'dismiss');
        expect(source.getInbox).not.toHaveBeenCalled();
    });
});

describe('progress', () => {
    it('refreshes the inbox after a tour is dismissed or completed, not after it starts', async () => {
        const { controller, source } = setup({ anchors: [] });
        const tour = makeTour('t', { steps: [{ key: 'a', title: 'A', body: 'B' }, { key: 'b', title: 'B', body: 'B' }] });

        await controller.startTour(tour);
        await flush();
        expect(source.getInbox).not.toHaveBeenCalled();

        controller.skip();
        await flush();

        expect(source.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dismissed', autoStarted: false }));
        expect(source.getInbox).toHaveBeenCalledTimes(1);

        await controller.startTour(tour);
        await controller.next();
        await controller.next();
        await flush();

        expect(source.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed', stepIndex: 1 }));
        expect(source.getInbox).toHaveBeenCalledTimes(2);
    });

    it('sends errors to onError without refreshing', async () => {
        const { controller, source, onError } = setup();
        const failure = new Error('down');
        source.recordProgress.mockRejectedValue(failure);

        await controller.startTour(makeTour('t'));
        await flush();
        controller.skip();
        await flush();

        expect(onError).toHaveBeenCalledWith(failure, 'progress');
        expect(source.getInbox).not.toHaveBeenCalled();
    });
});

describe('startTour', () => {
    it('fetches a tour by key and starts it as user-requested, never capped', async () => {
        const { controller, source, adapter } = setup();
        adapter.sessionValues.set('sapar.session-interruption-spent', '1');
        source.getTour.mockResolvedValue(makeTour('help'));

        await controller.startTour('help');

        expect(source.getTour).toHaveBeenCalledWith('help');
        expect(controller.getSnapshot().runner).toMatchObject({ phase: 'running', autoStarted: false });
    });

    it('reports an unknown key and a failing source', async () => {
        const { controller, source, onError } = setup();

        await controller.startTour('ghost');
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'No tour with key "ghost".' }), 'startTour');

        const failure = new Error('offline');
        source.getTour.mockRejectedValue(failure);
        await controller.startTour('help');
        expect(onError).toHaveBeenCalledWith(failure, 'startTour');
        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });
});

describe('markSeen', () => {
    it('clears an announcement interruption it marks seen', async () => {
        const { controller, source } = setup();
        const announcement = makeAnnouncement('launch', { tier: 'modal' });
        source.getInbox.mockResolvedValue(inboxWith({ kind: 'announcement', announcement }, { items: [announcement], unreadCount: 1 }));
        controller.setRoute('/');
        await flush();

        await controller.markSeen(['launch']);

        expect(controller.getSnapshot().inbox).toMatchObject({ interruption: null, unreadCount: 0 });
    });

    const items = [
        makeAnnouncement('a'),
        makeAnnouncement('b'),
        makeAnnouncement('quiet', { tier: 'silent' }),
        makeAnnouncement('read', {}, false),
    ];

    async function loaded() {
        const context = setup();
        context.source.getInbox.mockResolvedValue(inboxWith(null, { items, unreadCount: 2 }));
        await context.controller.refresh();
        return context;
    }

    it('flips unread flags and the count immediately, counting only non-silent unread items', async () => {
        const { controller, source } = await loaded();
        const pending = deferred();
        source.markSeen.mockReturnValue(pending.promise);

        const done = controller.markSeen(['a', 'quiet', 'read']);

        const inbox = controller.getSnapshot().inbox!;
        expect(inbox.unreadCount).toBe(1);
        expect(inbox.items.map((item) => item.unread)).toEqual([false, true, false, false]);
        pending.resolve();
        await done;
        expect(source.markSeen).toHaveBeenCalledWith(['a', 'quiet', 'read']);
        expect(controller.getSnapshot().inbox?.unreadCount).toBe(1);
    });

    it('rolls back only what it flipped when the source rejects', async () => {
        const { controller, source, onError } = await loaded();
        const failure = new Error('rejected');
        source.markSeen.mockRejectedValue(failure);

        await controller.markSeen(['a', 'read']);

        const inbox = controller.getSnapshot().inbox!;
        expect(inbox.unreadCount).toBe(2);
        expect(inbox.items.map((item) => item.unread)).toEqual([true, true, true, false]);
        expect(onError).toHaveBeenCalledWith(failure, 'markSeen');
    });

    it('still calls the source before the inbox has loaded', async () => {
        const { controller, source } = setup();

        await controller.markSeen(['a']);

        expect(source.markSeen).toHaveBeenCalledWith(['a']);
    });
});

describe('recordClick', () => {
    it('is fire-and-forget and reports failures', async () => {
        const { controller, source, onError } = setup();
        const failure = new Error('x');
        source.recordClick.mockRejectedValue(failure);

        controller.recordClick('news');
        await flush();

        expect(source.recordClick).toHaveBeenCalledWith('news');
        expect(onError).toHaveBeenCalledWith(failure, 'recordClick');
    });
});
