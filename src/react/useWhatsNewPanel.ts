'use client';

import { useEffect, useRef, useState } from 'react';
import type { Announcement, InboxStatus, Tour } from '../core';
import { useSaparController } from './context';
import { useWhatsNew } from './hooks';

export interface WhatsNewPanelItem extends Announcement {
    /** Unread when the panel was opened; stays true until it closes. */
    isNew: boolean;
}

export interface UseWhatsNewPanelResult {
    items: WhatsNewPanelItem[];
    status: InboxStatus;
    recordClick: (key: string) => void;
    startTour: (tourOrKey: Tour | string) => Promise<void>;
}

/** Marks what was unread as seen once per opening, while `isNew` keeps pointing at it until the panel closes. */
export function useWhatsNewPanel(open: boolean): UseWhatsNewPanelResult {
    const controller = useSaparController();
    const { items, status, recordClick, startTour } = useWhatsNew();
    const [newKeys, setNewKeys] = useState<ReadonlySet<string> | null>(null);
    const isOpeningHandled = useRef(false);

    useEffect(() => {
        if (!open) {
            isOpeningHandled.current = false;
            setNewKeys(null);
            return;
        }
        if (isOpeningHandled.current) return;
        isOpeningHandled.current = true;

        const unreadKeys = (controller.getSnapshot().inbox?.items ?? []).filter((item) => item.unread).map((item) => item.key);
        setNewKeys(new Set(unreadKeys));
        if (unreadKeys.length > 0) void controller.markSeen(unreadKeys);
    }, [open, controller]);

    return {
        items: items.map((item) => ({ ...item, isNew: newKeys ? newKeys.has(item.key) : item.unread })),
        status,
        recordClick,
        startTour,
    };
}
