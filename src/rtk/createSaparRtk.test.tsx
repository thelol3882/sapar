import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { createSaparController, createTestAdapter, httpSource } from '../core';
import type { ProgressInput, SaparSource } from '../core';
import { createSaparRtk } from './createSaparRtk';
import {
    BASE_URL,
    createHostApi,
    createRecordingFetch,
    createStoreFor,
    parseRequest,
    respondWithWire,
    wireTour,
} from './fixtures';
import type { RecordedRequest, Responder } from './fixtures';

const progress: ProgressInput = { key: 'onboarding', revision: 3, status: 'started', stepIndex: 1, autoStarted: true };

const sourceCalls: Array<[string, (source: SaparSource) => Promise<unknown>]> = [
    ['getInbox', (source) => source.getInbox({ route: '/billing', platform: 'web' })],
    ['getInbox without route', (source) => source.getInbox({ platform: 'native' })],
    ['getTour', (source) => source.getTour('onboarding')],
    ['getTour with an unsafe key', (source) => source.getTour('a/b c')],
    ['listAnnouncements', (source) => source.listAnnouncements()],
    ['recordProgress', (source) => source.recordProgress(progress)],
    ['markSeen', (source) => source.markSeen(['a', 'b'])],
    ['dismiss', (source) => source.dismiss('news/1')],
    ['recordClick', (source) => source.recordClick('news/1')],
];

function setupRtk(respond: Responder = respondWithWire, tagTypes: string[] = []) {
    const { requests, fetchFn } = createRecordingFetch(respond);
    const api = createHostApi(fetchFn, tagTypes);
    const tours = createSaparRtk(api);
    const store = createStoreFor(api);
    return { requests, tours, store, source: tours.createSource(store.dispatch), api };
}

async function runOverHttp(call: (source: SaparSource) => Promise<unknown>, respond: Responder = respondWithWire) {
    const requests: RecordedRequest[] = [];
    const source = httpSource({
        baseUrl: `${BASE_URL}/tours`,
        fetch: async (input, init) => {
            const recorded = parseRequest(init?.method ?? 'GET', String(input), init?.body as string | undefined);
            requests.push(recorded);
            return respond(recorded);
        },
    });
    return { requests, result: await call(source) };
}

describe('createSaparRtk source', () => {
    it.each(sourceCalls)('%s sends the same request and returns the same result as httpSource', async (_name, call) => {
        const rtk = setupRtk();
        const http = await runOverHttp(call);

        const result = await call(rtk.source);

        expect(rtk.requests).toEqual(http.requests);
        expect(result).toEqual(http.result);
    });

    it('maps the snake_case inbox to the camelCase contract', async () => {
        const { source } = setupRtk();

        const inbox = await source.getInbox({ platform: 'web' });

        expect(inbox).toMatchObject({
            unreadCount: 1,
            items: [{ key: 'news/1', imageUrl: '/img.png', cta: { label: 'Open', url: '/open' }, unread: true }],
            interruption: { kind: 'tour', tour: { key: 'onboarding', trigger: { route: '*' } } },
        });
    });

    it('resolves a 404 tour to null, like httpSource', async () => {
        const respond: Responder = () => Response.json({ detail: 'Not found' }, { status: 404 });
        const rtk = setupRtk(respond);
        const http = await runOverHttp((source) => source.getTour('gone'), respond);

        await expect(rtk.source.getTour('gone')).resolves.toBeNull();
        expect(http.result).toBeNull();
    });

    it('rejects a failed tour request that is not a 404', async () => {
        const { source } = setupRtk(() => Response.json({}, { status: 500 }));

        await expect(source.getTour('onboarding')).rejects.toMatchObject({ status: 500 });
    });

    it('rejects a failed mutation', async () => {
        const { source } = setupRtk(() => Response.json({}, { status: 500 }));

        await expect(source.markSeen(['a'])).rejects.toMatchObject({ status: 500 });
    });

    it('refetches on every call instead of serving the cache', async () => {
        const { source, requests } = setupRtk();

        await source.getInbox({ platform: 'web' });
        await source.getInbox({ platform: 'web' });

        expect(requests).toHaveLength(2);
    });

    it('honours a custom basePath', async () => {
        const { requests, fetchFn } = createRecordingFetch();
        const api = createHostApi(fetchFn);
        const store = createStoreFor(api);

        await createSaparRtk(api, { basePath: '/v2/onboarding/' }).createSource(store.dispatch).dismiss('news');

        expect(requests[0]?.path).toBe('/api/v2/onboarding/dismiss/');
    });
});

describe('createSaparRtk api', () => {
    it('registers the Sapar tag type on a host that declares other tags only', async () => {
        const { tours, store, requests } = setupRtk(respondWithWire, ['Post']);
        const subscription = store.dispatch(tours.api.endpoints.getSaparInbox.initiate({ platform: 'web' }));
        await subscription;

        store.dispatch(tours.api.util.invalidateTags([{ type: 'Sapar', id: 'inbox' }]));

        await waitFor(() => requests.filter(({ path }) => path.endsWith('/inbox/')).length === 2);
        subscription.unsubscribe();
    });

    it('refetches a subscribed inbox after progress is recorded', async () => {
        const { tours, store, requests, source } = setupRtk();
        const subscription = store.dispatch(tours.api.endpoints.getSaparInbox.initiate({ platform: 'web' }));
        await subscription;

        await source.recordProgress(progress);

        await waitFor(() => requests.filter(({ path }) => path.endsWith('/inbox/')).length === 2);
        subscription.unsubscribe();
    });

    it('does not refetch the inbox after an announcement click', async () => {
        const { tours, store, requests, source } = setupRtk();
        const subscription = store.dispatch(tours.api.endpoints.getSaparInbox.initiate({ platform: 'web' }));
        await subscription;

        await source.recordClick('news/1');
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(requests.filter(({ path }) => path.endsWith('/inbox/'))).toHaveLength(1);
        subscription.unsubscribe();
    });

    it('exposes the endpoint hooks', () => {
        const { tours } = setupRtk();

        expect(tours.useGetSaparInboxQuery).toBeTypeOf('function');
        expect(tours.useGetAnnouncementsQuery).toBeTypeOf('function');
        expect(tours.useRecordTourProgressMutation).toBeTypeOf('function');
    });
});

describe('useSaparSource', () => {
    it('returns one memoized source that works inside a Provider', async () => {
        const { requests, fetchFn } = createRecordingFetch();
        const api = createHostApi(fetchFn);
        const tours = createSaparRtk(api);
        const store = createStoreFor(api);
        const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

        const { result, rerender } = renderHook(() => tours.useSaparSource(), { wrapper });
        const first = result.current;
        rerender();

        expect(result.current).toBe(first);
        await expect(first.getTour('onboarding')).resolves.toMatchObject({ key: 'onboarding' });
        expect(requests).toHaveLength(1);
    });
});

describe('with createSaparController', () => {
    it('loads the inbox and records progress through the backend', async () => {
        const { source, requests } = setupRtk();
        const controller = createSaparController({ source, adapter: createTestAdapter({ anchors: ['nav.menu'] }) });

        controller.setRoute('/billing');
        await waitFor(() => controller.getSnapshot().inboxStatus === 'ready');
        await waitFor(() => requests.some(({ path }) => path.endsWith('/progress/')));

        expect(controller.getSnapshot().inbox?.unreadCount).toBe(1);
        expect(requests).toContainEqual({
            method: 'POST',
            path: `/api/tours/tours/${wireTour.key}/progress/`,
            params: {},
            body: { status: 'started', step_index: 0, auto_started: true },
        });
        controller.destroy();
    });
});

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
}
