'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { ActionIcon, Indicator } from '@mantine/core';
import { useState } from 'react';
import { useWhatsNew } from '../../src/react';
import { WhatsNewPanel, type WhatsNewPanelProps } from './WhatsNewPanel';

const MAX_DISPLAYED_COUNT = 9;

export interface WhatsNewButtonProps extends Pick<WhatsNewPanelProps, 'labels' | 'locale' | 'formatDate'> {
    className?: string;
    /** Accessible name; the unread count is appended. */
    label?: string;
}

function SparkleIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="20"
            height="20"
            aria-hidden="true"
        >
            <path d="M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0zM20 3v4M22 5h-4M4 17v2M5 18H3" />
        </svg>
    );
}

export function WhatsNewButton({ className, label = "What's new", labels, locale, formatDate }: WhatsNewButtonProps) {
    const [open, setOpen] = useState(false);
    const { unreadCount } = useWhatsNew();

    return (
        <>
            <Indicator
                label={unreadCount > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : unreadCount}
                disabled={unreadCount === 0}
                size={16}
                color="red"
            >
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    radius="xl"
                    className={className}
                    aria-label={unreadCount > 0 ? `${label} (${unreadCount})` : label}
                    onClick={() => setOpen(true)}
                >
                    <SparkleIcon />
                </ActionIcon>
            </Indicator>
            <WhatsNewPanel open={open} onClose={() => setOpen(false)} labels={labels} locale={locale} formatDate={formatDate} />
        </>
    );
}
