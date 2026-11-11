'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useWhatsNewPanel, type WhatsNewPanelItem } from '../../src/react';
import { BodyPortal } from '../../src/web';

export interface WhatsNewPanelLabels {
    title: string;
    empty: string;
    close: string;
    takeTour: string;
    new: string;
}

const DEFAULT_LABELS: WhatsNewPanelLabels = {
    title: "What's new",
    empty: 'Nothing new yet.',
    close: 'Close',
    takeTour: 'Take the tour',
    new: 'New',
};

// Replace these with your design tokens.
const styles = {
    overlay: 'fixed inset-0 z-[900] flex justify-end',
    backdrop: 'absolute inset-0 bg-black/40',
    panel: 'relative flex h-full w-full max-w-md flex-col bg-white text-neutral-900 shadow-xl focus:outline-none dark:bg-neutral-900 dark:text-neutral-100',
    header: 'flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800',
    heading: 'text-base font-semibold',
    close: 'rounded-md px-2 text-xl leading-none text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800',
    content: 'flex-1 overflow-y-auto px-5 py-4',
    empty: 'text-sm text-neutral-500 dark:text-neutral-400',
    list: 'space-y-6',
    entry: 'space-y-2 border-b border-neutral-200 pb-6 last:border-0 dark:border-neutral-800',
    entryHeader: 'flex items-center gap-2',
    entryTitle: 'text-sm font-semibold',
    newBadge: 'rounded-full bg-indigo-600 px-2 text-[10px] font-semibold uppercase leading-4 text-white',
    date: 'block text-xs text-neutral-500 dark:text-neutral-400',
    image: 'w-full rounded-lg',
    body: 'text-sm text-neutral-600 dark:text-neutral-300',
    actions: 'flex flex-wrap items-center gap-3',
    tourButton: 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500',
    link: 'text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400',
};

export interface WhatsNewPanelProps {
    open: boolean;
    onClose: () => void;
    labels?: Partial<WhatsNewPanelLabels>;
    /** BCP 47 tag for the default date format. Defaults to the browser locale. */
    locale?: string;
    /** Replaces the default date format; the template then never uses `Intl`. */
    formatDate?: (isoDate: string) => string;
}

function useFocusWhileOpen(open: boolean) {
    const panelRef = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement;
        panelRef.current?.focus();
        return () => {
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open]);
    return panelRef;
}

function formatDateWithIntl(isoDate: string, locale: string | undefined): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(isoDate));
}

function Entry({
    item,
    labels,
    formatDate,
    onCtaClick,
    onTakeTour,
}: {
    item: WhatsNewPanelItem;
    labels: WhatsNewPanelLabels;
    formatDate: (isoDate: string) => string;
    onCtaClick: (key: string) => void;
    onTakeTour: (tourKey: string) => void;
}) {
    const { tourKey } = item;

    return (
        <li className={styles.entry}>
            <div className={styles.entryHeader}>
                <h3 className={styles.entryTitle}>{item.title}</h3>
                {item.isNew && <span className={styles.newBadge}>{labels.new}</span>}
            </div>
            {item.publishedAt && (
                <time dateTime={item.publishedAt} className={styles.date}>
                    {formatDate(item.publishedAt)}
                </time>
            )}
            {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className={styles.image} />}
            <p className={styles.body}>{item.body}</p>
            <div className={styles.actions}>
                {tourKey && (
                    <button type="button" onClick={() => onTakeTour(tourKey)} className={styles.tourButton}>
                        {labels.takeTour}
                    </button>
                )}
                {item.cta && (
                    <a
                        href={item.cta.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onCtaClick(item.key)}
                        className={styles.link}
                    >
                        {item.cta.label}
                    </a>
                )}
            </div>
        </li>
    );
}

export function WhatsNewPanel({ open, onClose, labels, locale, formatDate }: WhatsNewPanelProps) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const { items, recordClick, startTour } = useWhatsNewPanel(open);
    const panelRef = useFocusWhileOpen(open);
    const format = formatDate ?? ((isoDate: string) => formatDateWithIntl(isoDate, locale));

    if (!open) return null;

    function handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') onClose();
    }

    function takeTour(tourKey: string): void {
        onClose();
        void startTour(tourKey);
    }

    return (
        <BodyPortal>
            <div className={styles.overlay} onKeyDown={handleKeyDown}>
                <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
                <aside ref={panelRef} role="dialog" aria-modal="true" aria-label={text.title} tabIndex={-1} className={styles.panel}>
                    <header className={styles.header}>
                        <h2 className={styles.heading}>{text.title}</h2>
                        <button type="button" aria-label={text.close} onClick={onClose} className={styles.close}>
                            ×
                        </button>
                    </header>
                    <div className={styles.content}>
                        {items.length === 0 ? (
                            <p className={styles.empty}>{text.empty}</p>
                        ) : (
                            <ul className={styles.list}>
                                {items.map((item) => (
                                    <Entry
                                        key={item.key}
                                        item={item}
                                        labels={text}
                                        formatDate={format}
                                        onCtaClick={recordClick}
                                        onTakeTour={takeTour}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>
            </div>
        </BodyPortal>
    );
}
