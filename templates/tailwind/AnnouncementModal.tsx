'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useAnnouncementInterruption, useWhatsNew } from '../../src/react';
import { BodyPortal } from '../../src/web';

export interface AnnouncementModalLabels {
    acknowledge: string;
    takeTour: string;
}

const DEFAULT_LABELS: AnnouncementModalLabels = {
    acknowledge: 'Got it',
    takeTour: 'Take the tour',
};

// Replace these with your design tokens.
const styles = {
    overlay: 'fixed inset-0 z-[900] flex items-center justify-center p-4',
    backdrop: 'absolute inset-0 bg-black/50',
    dialog: 'relative w-full max-w-md space-y-3 rounded-xl bg-white p-6 text-neutral-900 shadow-xl focus:outline-none dark:bg-neutral-900 dark:text-neutral-100',
    image: 'w-full rounded-lg',
    title: 'text-lg font-semibold',
    body: 'text-sm text-neutral-600 dark:text-neutral-300',
    link: 'inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400',
    actions: 'flex justify-end gap-2 pt-2',
    secondaryButton: 'rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
    primaryButton: 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500',
};

export function AnnouncementModal({ labels }: { labels?: Partial<AnnouncementModalLabels> }) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const { announcement, dismiss, acknowledge } = useAnnouncementInterruption();
    const { recordClick, startTour } = useWhatsNew();
    const dialogRef = useRef<HTMLDivElement>(null);
    const announcementKey = announcement?.key;

    useEffect(() => {
        if (announcementKey) dialogRef.current?.focus();
    }, [announcementKey]);

    if (!announcement) return null;
    const { tourKey } = announcement;

    function handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') void dismiss();
    }

    async function takeTour(tourKey: string): Promise<void> {
        await acknowledge();
        await startTour(tourKey);
    }

    return (
        <BodyPortal>
            <div className={styles.overlay} onKeyDown={handleKeyDown}>
                <div className={styles.backdrop} aria-hidden="true" onClick={() => void dismiss()} />
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="announcement-title"
                    aria-describedby="announcement-body"
                    tabIndex={-1}
                    className={styles.dialog}
                >
                    {announcement.imageUrl && <img src={announcement.imageUrl} alt="" className={styles.image} />}
                    <h2 id="announcement-title" className={styles.title}>
                        {announcement.title}
                    </h2>
                    <p id="announcement-body" className={styles.body}>
                        {announcement.body}
                    </p>
                    {announcement.cta && (
                        <a
                            href={announcement.cta.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => recordClick(announcement.key)}
                            className={styles.link}
                        >
                            {announcement.cta.label}
                        </a>
                    )}
                    <div className={styles.actions}>
                        {tourKey && (
                            <button type="button" onClick={() => void takeTour(tourKey)} className={styles.secondaryButton}>
                                {text.takeTour}
                            </button>
                        )}
                        <button type="button" onClick={() => void acknowledge()} className={styles.primaryButton}>
                            {text.acknowledge}
                        </button>
                    </div>
                </div>
            </div>
        </BodyPortal>
    );
}
