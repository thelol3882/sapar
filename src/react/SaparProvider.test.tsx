import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestAdapter, defineAnnouncement, defineTour, memorySource, memoryStore } from '../core';
import { SaparProvider } from './SaparProvider';
import { useSaparController } from './context';
import { useAnnouncementInterruption, useTourStep, useSapar, useWhatsNew } from './hooks';
import { createHarness } from './testHarness';

const welcome = defineTour({
    key: 'welcome',
    title: 'Welcome',
    trigger: { route: '/dashboard' },
    steps: [
        { key: 'one', title: 'First step', body: 'One' },
        { key: 'two', title: 'Second step', body: 'Two' },
    ],
});

const manual = defineTour({ key: 'manual', title: 'Manual', steps: [{ key: 'only', title: 'Only step', body: 'Body' }] });

const feed = (key: string) => defineAnnouncement({ key, title: key, body: 'Body', publishedAt: '2026-01-01T00:00:00Z' });

afterEach(() => vi.restoreAllMocks());

describe('context', () => {
    it('explains a missing provider', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useSapar())).toThrow('inside <SaparProvider>');
    });
});

describe('SaparProvider', () => {
    function ownedProvider(route?: string) {
        const source = memorySource({ tours: [welcome], storage: memoryStore(), registeredAt: new Date('2020-01-01') });
        const adapter = createTestAdapter();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SaparProvider source={source} adapter={adapter} route={route}>
                {children}
            </SaparProvider>
        );
        return { source, adapter, wrapper };
    }

    it('keeps one controller across renders and recreates it when the source changes', () => {
        const { source, adapter } = ownedProvider();
        const otherSource = memorySource({ tours: [], storage: memoryStore() });
        const wrapperFor = (current: typeof source) => ({ children }: { children: ReactNode }) => (
            <SaparProvider source={current} adapter={adapter}>
                {children}
            </SaparProvider>
        );

        const { result, rerender } = renderHook(() => useSaparController(), { wrapper: wrapperFor(source) });
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);

        const { result: other } = renderHook(() => useSaparController(), { wrapper: wrapperFor(otherSource) });
        expect(other.current).not.toBe(first);
    });

    it('destroys an owned controller on unmount but not one it was given', async () => {
        const { wrapper } = ownedProvider();
        const owned = renderHook(() => useSaparController(), { wrapper });
        const ownedDestroy = vi.spyOn(owned.result.current, 'destroy');
        owned.unmount();
        await Promise.resolve();
        expect(ownedDestroy).toHaveBeenCalledTimes(1);

        const harness = createHarness();
        const given = renderHook(() => useSaparController(), { wrapper: harness.wrapper });
        const givenDestroy = vi.spyOn(harness.controller, 'destroy');
        given.unmount();
        await Promise.resolve();
        expect(givenDestroy).not.toHaveBeenCalled();
    });

    it('survives StrictMode double effects', async () => {
        const { wrapper: Inner } = ownedProvider('/dashboard');
        const Strict = ({ children }: { children: ReactNode }) => (
            <StrictMode>
                <Inner>{children}</Inner>
            </StrictMode>
        );

        const { result } = renderHook(() => ({ tours: useSapar(), step: useTourStep() }), { wrapper: Strict });

        await waitFor(() => expect(result.current.step?.step.title).toBe('First step'));
    });

    it('forwards route changes to the controller', () => {
        const { controller } = createHarness();
        const setRoute = vi.spyOn(controller, 'setRoute');

        const { rerender } = render(
            <SaparProvider controller={controller} route="/a">
                <span />
            </SaparProvider>,
        );
        rerender(
            <SaparProvider controller={controller} route="/b">
                <span />
            </SaparProvider>,
        );

        expect(setRoute.mock.calls.map(([route]) => route)).toEqual(['/a', '/b']);
    });
});

describe('hooks', () => {
    it('auto-starts a tour offered for the route and exposes its step', async () => {
        const { wrapper } = createHarness({ tours: [welcome], route: '/dashboard' });
        const { result } = renderHook(() => useTourStep(), { wrapper });

        await waitFor(() => expect(result.current).not.toBeNull());

        expect(result.current).toMatchObject({ position: 1, total: 2, isFirst: true, isLast: false });
        expect(result.current).not.toHaveProperty('index');
        expect(result.current?.step.title).toBe('First step');
        expect(result.current?.tour.key).toBe('welcome');
    });

    it('counts position, total and the last step among the steps not known to be missing', async () => {
        const gaps = defineTour({
            key: 'gaps',
            title: 'Gaps',
            steps: [
                { key: 'one', title: 'One', body: 'B' },
                { key: 'two', title: 'Two', body: 'B', anchor: 'gone.two' },
                { key: 'three', title: 'Three', body: 'B', anchor: 'here.three' },
                { key: 'four', title: 'Four', body: 'B', anchor: 'gone.four' },
            ],
        });
        const { wrapper } = createHarness({ tours: [gaps], anchors: ['here.three'] });
        const { result } = renderHook(() => ({ step: useTourStep(), tours: useSapar() }), { wrapper });

        await act(() => result.current.tours.startTour('gaps'));
        expect(result.current.step).toMatchObject({ position: 1, total: 2, isFirst: true, isLast: false });

        await act(() => result.current.step!.next());
        expect(result.current.step).toMatchObject({ position: 2, total: 2, isFirst: false, isLast: true });
        expect(result.current.step?.step.key).toBe('three');
    });

    it('keeps the step state referentially stable between commits', async () => {
        const { wrapper } = createHarness({ tours: [welcome] });
        const { result, rerender } = renderHook(() => ({ step: useTourStep(), tours: useSapar() }), { wrapper });
        await act(() => result.current.tours.startTour('welcome'));
        const before = result.current.step;

        rerender();

        expect(result.current.step).toBe(before);
    });

    it('walks a started tour forward, back and to completion', async () => {
        const { wrapper, controller, recordProgress } = createHarness({ tours: [manual, welcome] });
        const { result } = renderHook(() => ({ step: useTourStep(), tours: useSapar() }), { wrapper });
        expect(result.current.step).toBeNull();
        expect(result.current.tours.isRunning).toBe(false);

        await act(() => result.current.tours.startTour('welcome'));
        expect(result.current.tours.isRunning).toBe(true);

        await act(() => result.current.step!.next());
        expect(result.current.step).toMatchObject({ position: 2, isLast: true });

        await act(() => result.current.step!.previous());
        expect(result.current.step?.position).toBe(1);

        await act(async () => {
            await result.current.step!.next();
            await result.current.step!.next();
        });
        expect(result.current.step).toBeNull();
        expect(recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'welcome', status: 'completed' }));
        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('marks every unread item seen and updates the badge', async () => {
        const { wrapper, controller } = createHarness({ announcements: [feed('one'), feed('two')] });
        const { result } = renderHook(() => useWhatsNew(), { wrapper });
        await act(() => controller.refresh());
        expect(result.current).toMatchObject({ unreadCount: 2, status: 'ready' });
        expect(result.current.items).toHaveLength(2);

        await act(() => result.current.markAllSeen());

        expect(result.current.unreadCount).toBe(0);
        expect(result.current.items.every((item) => !item.unread)).toBe(true);
    });

    it('does not call the source when nothing is unread', async () => {
        const { wrapper, controller, source } = createHarness({ announcements: [feed('one')] });
        const markSeen = vi.spyOn(source, 'markSeen');
        const { result } = renderHook(() => useWhatsNew(), { wrapper });
        await act(() => controller.refresh());
        await act(() => result.current.markAllSeen());
        await act(() => result.current.markAllSeen());

        expect(markSeen).toHaveBeenCalledTimes(1);
    });

    describe('announcement interruption', () => {
        const modal = defineAnnouncement({
            key: 'big_news',
            tier: 'modal',
            title: 'Big news',
            body: 'Body',
            publishedAt: '2026-01-01T00:00:00Z',
        });

        async function setup() {
            const harness = createHarness({ announcements: [modal], route: '/anywhere' });
            const hook = renderHook(() => useAnnouncementInterruption(), { wrapper: harness.wrapper });
            await waitFor(() => expect(hook.result.current.announcement?.key).toBe('big_news'));
            return { ...harness, hook };
        }

        it('surfaces the modal-tier announcement', async () => {
            const { hook } = await setup();
            expect(hook.result.current.announcement?.title).toBe('Big news');
        });

        it('acknowledge marks it seen and hides it', async () => {
            const { hook, source } = await setup();
            const markSeen = vi.spyOn(source, 'markSeen');

            await act(() => hook.result.current.acknowledge());

            expect(markSeen).toHaveBeenCalledWith(['big_news']);
            expect(hook.result.current.announcement).toBeNull();
        });

        it('dismiss records the dismissal and hides it', async () => {
            const { hook, source } = await setup();
            const dismiss = vi.spyOn(source, 'dismiss');

            await act(() => hook.result.current.dismiss());

            expect(dismiss).toHaveBeenCalledWith('big_news');
            await waitFor(() => expect(hook.result.current.announcement).toBeNull());
        });
    });

    it('renders hook output in components', async () => {
        const { wrapper, controller } = createHarness({ announcements: [feed('one')] });
        const Badge = () => <span data-testid="badge">{useWhatsNew().unreadCount}</span>;
        render(<Badge />, { wrapper });
        await act(() => controller.refresh());
        expect(screen.getByTestId('badge')).toHaveTextContent('1');
    });
});
