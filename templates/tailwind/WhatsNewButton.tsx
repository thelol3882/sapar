'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { useState } from 'react';
import { useWhatsNew } from '../../src/react';
import { WhatsNewPanel, type WhatsNewPanelProps } from './WhatsNewPanel';

// Replace these with your design tokens.
const styles = {
    button: 'relative rounded-full p-2 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-neutral-300 dark:hover:bg-neutral-800',
    icon: 'size-5',
    badge: 'absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white',
};

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
            className={styles.icon}
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
            <button
                type="button"
                aria-label={unreadCount > 0 ? `${label} (${unreadCount})` : label}
                onClick={() => setOpen(true)}
                className={className ?? styles.button}
            >
                <SparkleIcon />
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </button>
            <WhatsNewPanel open={open} onClose={() => setOpen(false)} labels={labels} locale={locale} formatDate={formatDate} />
        </>
    );
}
