import { describe, expect, it, vi } from 'vitest';
import type { WireInbox, WireTour } from '../wire';
import { SaparHttpError, httpSource } from './http';

const wireTour: WireTour = {
    key: 'onboarding',
    revision: 3,
    title: 'Onboarding',
    trigger: 'route',
    steps: [
        {
            step_key: 'second',
            order: 2,
            anchor_key: '',
            route: '',
            title: 'Second',
            body: 'B',
            placement: 'auto',
            spotlight_padding: 4,
            is_required: false,
        },
        {
            step_key: 'first',
            order: 1,
            anchor_key: 'nav.menu',
            route: '/settings',
            title: 'First',
            body: 'B',
            placement: 'left',
            spotlight_padding: 8,
            is_required: true,
        },
    ],
};

const wireInbox: WireInbox = {
    unread_count: 1,
    items: [
        {
            key: 'news',
            tier: 'modal',
            title: 'News',
            body: 'Body',
            image_url: '/img.png',
            cta_label: 'Open',
            cta_url: '/open',
            published_at: '2026-01-01T00:00:00Z',
            tour_key: 'onboarding',
            is_unread: true,
        },
        {
            key: 'plain',
            tier: 'feed',
            title: 'Plain',
            body: 'Body',
            image_url: '',
            cta_label: '',
            cta_url: '',
            published_at: null,
            tour_key: null,
            is_unread: false,
        },
    ],
    interruption: { kind: 'tour', tour: wireTour, announcement: null },
};

function setup(respond: (url: string, init: RequestInit) => Response = () => Response.json({})) {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => respond(String(input), init ?? {}));
    const source = httpSource({ baseUrl: 'https://api.test/tours/', fetch: fetchMock });
    const lastCall = () => {
        const [url, init] = fetchMock.mock.calls.at(-1)!;
        return { url: String(url), init: init! };
    };
    return { source, fetchMock, lastCall };
}

describe('httpSource', () => {
    it('requests the inbox with route, platform and lang, and maps the payload', async () => {
        const { lastCall, ...rest } = setup(() => Response.json(wireInbox));
        const source = httpSource({ baseUrl: 'https://api.test/tours', fetch: rest.fetchMock, locale: () => 'ru' });

        const inbox = await source.getInbox({ route: '/billing/invoices', platform: 'web' });

        expect(lastCall().url).toBe('https://api.test/tours/inbox/?lang=ru&route=%2Fbilling%2Finvoices&platform=web');
        expect(lastCall().init.method).toBe('GET');
        expect(inbox.unreadCount).toBe(1);
        expect(inbox.items[0]).toEqual({
            key: 'news',
            tier: 'modal',
            title: 'News',
            body: 'Body',
            imageUrl: '/img.png',
            cta: { label: 'Open', url: '/open' },
            publishedAt: '2026-01-01T00:00:00Z',
            tourKey: 'onboarding',
            unread: true,
        });
        expect(inbox.items[1]).toEqual({
            key: 'plain',
            tier: 'feed',
            title: 'Plain',
            body: 'Body',
            publishedAt: null,
            unread: false,
        });
    });

    it('omits route and lang when not given', async () => {
        const { source, lastCall } = setup(() => Response.json(wireInbox));

        await source.getInbox({ platform: 'native' });

        expect(lastCall().url).toBe('https://api.test/tours/inbox/?platform=native');
    });

    it('maps the interruption tour: ordered steps, empty strings dropped, route trigger kept', async () => {
        const { source } = setup(() => Response.json(wireInbox));

        const { interruption } = await source.getInbox({ platform: 'web' });

        expect(interruption).toEqual({
            kind: 'tour',
            tour: {
                key: 'onboarding',
                revision: 3,
                title: 'Onboarding',
                trigger: { route: '*' },
                steps: [
                    {
                        key: 'first',
                        anchor: 'nav.menu',
                        route: '/settings',
                        title: 'First',
                        body: 'B',
                        placement: 'left',
                        padding: 8,
                        required: true,
                        advanceOn: 'next',
                    },
                    {
                        key: 'second',
                        title: 'Second',
                        body: 'B',
                        placement: 'auto',
                        padding: 4,
                        required: false,
                        advanceOn: 'next',
                    },
                ],
            },
        });
    });

    it('maps an announcement interruption and a null one', async () => {
        const announcement = wireInbox.items[0]!;
        const withModal = setup(() => Response.json({ ...wireInbox, interruption: { kind: 'announcement', tour: null, announcement } }));
        const withNone = setup(() => Response.json({ ...wireInbox, interruption: null }));

        expect((await withModal.source.getInbox({ platform: 'web' })).interruption).toMatchObject({
            kind: 'announcement',
            announcement: { key: 'news' },
        });
        expect((await withNone.source.getInbox({ platform: 'web' })).interruption).toBeNull();
    });

    it('maps a manual tour', async () => {
        const { source, lastCall } = setup(() => Response.json({ ...wireTour, trigger: 'manual', state: null }));

        const tour = await source.getTour('my tour');

        expect(lastCall().url).toBe('https://api.test/tours/tours/my%20tour/');
        expect(tour?.trigger).toBe('manual');
    });

    it('returns null for a missing tour and throws SaparHttpError otherwise', async () => {
        const missing = setup(() => new Response(null, { status: 404 }));
        const broken = setup(() => new Response(null, { status: 500 }));

        expect(await missing.source.getTour('x')).toBeNull();
        await expect(broken.source.getTour('x')).rejects.toMatchObject({ name: 'SaparHttpError', status: 500 });
        await expect(broken.source.getInbox({ platform: 'web' })).rejects.toBeInstanceOf(SaparHttpError);
    });

    it('posts progress in the backend shape', async () => {
        const { source, lastCall } = setup(() => new Response(null, { status: 200 }));

        await source.recordProgress({ key: 'onboarding', revision: 3, status: 'dismissed', stepIndex: 2, autoStarted: true });

        expect(lastCall().url).toBe('https://api.test/tours/tours/onboarding/progress/');
        expect(lastCall().init.method).toBe('POST');
        expect(JSON.parse(lastCall().init.body as string)).toEqual({ status: 'dismissed', step_index: 2, auto_started: true });
        expect(new Headers(lastCall().init.headers).get('Content-Type')).toBe('application/json');
    });

    it('posts seen, dismiss and click to their endpoints', async () => {
        const { source, lastCall } = setup(() => new Response(null, { status: 204 }));

        await source.markSeen(['a', 'b']);
        expect([lastCall().url, lastCall().init.body]).toEqual(['https://api.test/tours/seen/', '{"keys":["a","b"]}']);
        await source.dismiss('a');
        expect([lastCall().url, lastCall().init.body]).toEqual(['https://api.test/tours/dismiss/', '{"key":"a"}']);
        await source.recordClick('a/b');
        expect([lastCall().url, lastCall().init.body]).toEqual(['https://api.test/tours/announcements/a%2Fb/click/', undefined]);
    });

    it('lists announcements', async () => {
        const { source, lastCall } = setup(() => Response.json(wireInbox.items));

        const items = await source.listAnnouncements();

        expect(lastCall().url).toBe('https://api.test/tours/announcements/');
        expect(items.map((item) => item.key)).toEqual(['news', 'plain']);
    });

    it('sends static or async headers and credentials', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => Response.json(wireInbox));
        const source = httpSource({
            baseUrl: 'https://api.test',
            fetch: fetchMock,
            credentials: 'include',
            headers: async () => ({ Authorization: 'Bearer token' }),
        });

        await source.getInbox({ platform: 'web' });

        const init = fetchMock.mock.calls[0]![1]!;
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
        expect(new Headers(init.headers).get('Accept')).toBe('application/json');
        expect(init.credentials).toBe('include');
    });
});
