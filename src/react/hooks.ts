'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type {
    AnchorHandle,
    Announcement,
    Inbox,
    InboxStatus,
    Tour,
    TourStep as TourStepData,
    SaparSnapshot,
} from '../core';
import { useSaparController } from './context';

export function useSaparSnapshot(): SaparSnapshot {
    const controller = useSaparController();
    return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export interface UseSaparResult {
    startTour: (tourOrKey: Tour | string) => Promise<void>;
    inbox: Inbox | null;
    inboxStatus: InboxStatus;
    isRunning: boolean;
}

export function useSapar(): UseSaparResult {
    const controller = useSaparController();
    const { inbox, inboxStatus, runner } = useSaparSnapshot();
    return { startTour: controller.startTour, inbox, inboxStatus, isRunning: runner.phase === 'running' };
}

export interface TourStepState {
    tour: Tour;
    step: TourStepData;
    /** One-based position among the steps that are expected to be shown. */
    position: number;
    total: number;
    isFirst: boolean;
    isLast: boolean;
    handle: AnchorHandle | null;
    next: () => Promise<void>;
    previous: () => Promise<void>;
    skip: () => void;
}

export function useTourStep(): TourStepState | null {
    const controller = useSaparController();
    const { runner } = useSaparSnapshot();
    return useMemo(() => {
        const step = runner.tour?.steps[runner.index];
        if (runner.phase !== 'running' || !runner.tour || !step) return null;

        const shown = runner.tour.steps.filter((candidate) => !runner.skipped.includes(candidate.key));
        const position = shown.findIndex((candidate) => candidate.key === step.key) + 1;
        return {
            tour: runner.tour,
            step,
            position,
            total: shown.length,
            isFirst: position === 1,
            isLast: position === shown.length,
            handle: runner.handle,
            next: controller.next,
            previous: controller.previous,
            skip: controller.skip,
        };
    }, [controller, runner]);
}

export interface UseWhatsNewResult {
    items: Announcement[];
    unreadCount: number;
    status: InboxStatus;
    /** Marks the items that are unread at the moment of the call. */
    markAllSeen: () => Promise<void>;
    markSeen: (keys: string[]) => Promise<void>;
    dismiss: (key: string) => Promise<void>;
    recordClick: (key: string) => void;
    startTour: (tourOrKey: Tour | string) => Promise<void>;
}

export function useWhatsNew(): UseWhatsNewResult {
    const controller = useSaparController();
    const { inbox, inboxStatus } = useSaparSnapshot();
    const actions = useMemo(
        () => ({
            markAllSeen: async () => {
                const unreadKeys = (controller.getSnapshot().inbox?.items ?? [])
                    .filter((item) => item.unread)
                    .map((item) => item.key);
                if (unreadKeys.length > 0) await controller.markSeen(unreadKeys);
            },
            markSeen: controller.markSeen,
            dismiss: controller.dismiss,
            recordClick: controller.recordClick,
            startTour: controller.startTour,
        }),
        [controller],
    );
    return { items: inbox?.items ?? [], unreadCount: inbox?.unreadCount ?? 0, status: inboxStatus, ...actions };
}

export interface AnnouncementInterruption {
    /** The modal-tier announcement the source wants shown now, if any. */
    announcement: Announcement | null;
    dismiss: () => Promise<void>;
    /** Marks the announcement seen without recording a dismissal. */
    acknowledge: () => Promise<void>;
}

export function useAnnouncementInterruption(): AnnouncementInterruption {
    const controller = useSaparController();
    const { inbox } = useSaparSnapshot();
    const offered = inbox?.interruption;
    const announcement = offered?.kind === 'announcement' && offered.announcement.tier === 'modal' ? offered.announcement : null;

    return useMemo(
        () => ({
            announcement,
            dismiss: async () => {
                if (announcement) await controller.dismiss(announcement.key);
            },
            acknowledge: async () => {
                if (announcement) await controller.markSeen([announcement.key]);
            },
        }),
        [controller, announcement],
    );
}
