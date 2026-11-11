import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defineAnnouncement } from '../core';
import { useWhatsNewPanel } from './useWhatsNewPanel';
import { createHarness } from './testHarness';

const feed = [
    defineAnnouncement({ key: 'news_one', title: 'Dark mode', body: 'Try it', publishedAt: '2026-03-01T00:00:00Z' }),
    defineAnnouncement({ key: 'news_two', title: 'Faster search', body: 'Zoom', publishedAt: '2026-02-01T00:00:00Z' }),
];

async function setup() {
    const harness = createHarness({ announcements: feed });
    const markSeen = vi.spyOn(harness.source, 'markSeen');
    const view = renderHook(({ open }) => useWhatsNewPanel(open), {
        wrapper: harness.wrapper,
        initialProps: { open: false },
    });
    await act(() => harness.controller.refresh());
    return { ...harness, ...view, markSeen };
}

const newKeys = (items: { key: string; isNew: boolean }[]) => items.filter((item) => item.isNew).map((item) => item.key);

describe('useWhatsNewPanel', () => {
    it('keeps the markers while open although the items are marked seen', async () => {
        const { result, rerender, controller } = await setup();

        rerender({ open: true });

        await vi.waitFor(() => expect(controller.getSnapshot().inbox?.unreadCount).toBe(0));
        expect(newKeys(result.current.items).sort()).toEqual(['news_one', 'news_two']);
        expect(result.current.items.some((item) => item.unread)).toBe(false);
    });

    it('marks exactly the unread keys seen, once per opening', async () => {
        const { rerender, markSeen, controller } = await setup();

        rerender({ open: true });
        await vi.waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));
        expect(markSeen).toHaveBeenCalledWith(['news_one', 'news_two']);

        await act(() => controller.refresh());
        rerender({ open: true });
        expect(markSeen).toHaveBeenCalledTimes(1);
    });

    it('does not loop when the controller functions change identity', async () => {
        const { rerender, markSeen, controller } = await setup();
        rerender({ open: true });
        await vi.waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));

        vi.spyOn(controller, 'markSeen').mockImplementation(async () => {});
        vi.spyOn(controller, 'recordClick').mockImplementation(() => {});
        rerender({ open: true });
        await act(() => controller.refresh());

        expect(markSeen).toHaveBeenCalledTimes(1);
    });

    it('shows nothing new when reopened', async () => {
        const { result, rerender, markSeen } = await setup();
        rerender({ open: true });
        await vi.waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));

        rerender({ open: false });
        rerender({ open: true });

        await vi.waitFor(() => expect(newKeys(result.current.items)).toEqual([]));
        expect(markSeen).toHaveBeenCalledTimes(1);
    });

    it('marks nothing when nothing is unread', async () => {
        const harness = createHarness();
        const markSeen = vi.spyOn(harness.source, 'markSeen');
        const { result } = renderHook(() => useWhatsNewPanel(true), { wrapper: harness.wrapper });
        await act(() => harness.controller.refresh());

        expect(result.current.items).toEqual([]);
        expect(markSeen).not.toHaveBeenCalled();
    });
});
