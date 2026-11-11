import { vi } from 'vitest';
import { defineAnnouncement, defineTour, resolveAnnouncement, resolveTour } from './define';
import type { AnnouncementInput, StepInput, TextLocale, TourInput } from './define';
import type { Announcement, Inbox, Tour, SaparSource } from './types';

export const EN: TextLocale = { locale: 'en', fallbackLocale: 'en' };

export const EMPTY_INBOX: Inbox = { unreadCount: 0, items: [], interruption: null };

const INTRO: StepInput = { key: 'intro', title: 'Intro', body: 'Welcome' };

export function makeTour(key: string, input: Partial<Omit<TourInput, 'key'>> = {}): Tour {
    return resolveTour(defineTour({ key, title: key, steps: [INTRO], ...input }), EN);
}

export function makeAnnouncement(
    key: string,
    input: Partial<Omit<AnnouncementInput, 'key'>> = {},
    unread = true,
): Announcement {
    const definition = defineAnnouncement({
        key,
        title: key,
        body: 'Body',
        publishedAt: '2026-01-01T00:00:00Z',
        ...input,
    });
    return resolveAnnouncement(definition, EN, unread);
}

export function makeSource() {
    return {
        getInbox: vi.fn<SaparSource['getInbox']>(async () => EMPTY_INBOX),
        getTour: vi.fn<SaparSource['getTour']>(async () => null),
        recordProgress: vi.fn<SaparSource['recordProgress']>(async () => {}),
        markSeen: vi.fn<SaparSource['markSeen']>(async () => {}),
        dismiss: vi.fn<SaparSource['dismiss']>(async () => {}),
        recordClick: vi.fn<SaparSource['recordClick']>(async () => {}),
        listAnnouncements: vi.fn<SaparSource['listAnnouncements']>(async () => []),
    };
}

export interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
}

export function deferred<T = void>(): Deferred<T> {
    let resolve!: Deferred<T>['resolve'];
    let reject!: Deferred<T>['reject'];
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
