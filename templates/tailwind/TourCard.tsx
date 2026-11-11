'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { TourOverlay, TourStep, type TourOverlayProps } from '../../src/web';
import type { StepAnnouncement, StepCount } from '../../src/react';

export interface TourCardLabels {
    next: string;
    back: string;
    skip: string;
    done: string;
    close: string;
    progress: ({ position, total }: StepCount) => string;
    announceStep: ({ position, total, title }: StepAnnouncement) => string;
}

const DEFAULT_LABELS: TourCardLabels = {
    next: 'Next',
    back: 'Back',
    skip: 'Skip tour',
    done: 'Done',
    close: 'Close tour',
    progress: ({ position, total }) => `${position} / ${total}`,
    announceStep: ({ position, total, title }) => `Step ${position} of ${total}: ${title}`,
};

// Replace these with your design tokens.
const styles = {
    spotlight: 'z-[1000] text-black/50',
    popover: 'z-[1001]',
    card: 'w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-xl outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-offset-neutral-900',
    header: 'flex items-center justify-between',
    progress: 'text-xs font-medium text-neutral-500 dark:text-neutral-400',
    close: '-mr-1 rounded-md px-2 text-lg leading-none text-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-neutral-800',
    title: 'mt-2 text-base font-semibold',
    body: 'mt-1 text-sm text-neutral-600 dark:text-neutral-300',
    footer: 'mt-4 flex items-center justify-between gap-2',
    actions: 'flex items-center gap-2',
    secondaryButton: 'rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-neutral-300 dark:hover:bg-neutral-800',
    primaryButton: 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
};

export interface TourCardProps extends Pick<TourOverlayProps, 'presentation'> {
    labels?: Partial<TourCardLabels>;
}

export function TourCard({ labels, presentation }: TourCardProps) {
    const text = { ...DEFAULT_LABELS, ...labels };

    return (
        <TourOverlay spotlightClassName={styles.spotlight} popoverClassName={styles.popover} presentation={presentation}>
            <TourStep.Root announceStep={text.announceStep} className={styles.card}>
                <div className={styles.header}>
                    <TourStep.Progress className={styles.progress}>{text.progress}</TourStep.Progress>
                    <TourStep.Close aria-label={text.close} className={styles.close} />
                </div>
                <TourStep.Title className={styles.title} />
                <TourStep.Body className={styles.body} />
                <div className={styles.footer}>
                    <TourStep.Skip className={styles.secondaryButton}>{text.skip}</TourStep.Skip>
                    <div className={styles.actions}>
                        <TourStep.Back className={styles.secondaryButton}>{text.back}</TourStep.Back>
                        <TourStep.Next nextLabel={text.next} doneLabel={text.done} className={styles.primaryButton} />
                    </div>
                </div>
            </TourStep.Root>
        </TourOverlay>
    );
}
