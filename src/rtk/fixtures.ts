import { configureStore } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { WireAnnouncement, WireInbox, WireTour } from '../core';

export const BASE_URL = 'http://test/api';

export const wireTour: WireTour = {
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

export const wireAnnouncement: WireAnnouncement = {
    key: 'news/1',
    tier: 'modal',
    title: 'News',
    body: 'Body',
    image_url: '/img.png',
    cta_label: 'Open',
    cta_url: '/open',
    published_at: '2026-01-01T00:00:00Z',
    tour_key: 'onboarding',
    is_unread: true,
};

export const wireInbox: WireInbox = {
    unread_count: 1,
    items: [wireAnnouncement],
    interruption: { kind: 'tour', tour: wireTour, announcement: null },
};

export interface RecordedRequest {
    method: string;
    path: string;
    params: Record<string, string>;
    body: unknown;
}

export function parseRequest(method: string, rawUrl: string, rawBody: string | null | undefined): RecordedRequest {
    const url = new URL(rawUrl);
    return {
        method,
        path: url.pathname,
        params: Object.fromEntries(url.searchParams),
        body: rawBody ? JSON.parse(rawBody) : undefined,
    };
}

export type Responder = (request: RecordedRequest) => Response;

export const respondWithWire: Responder = ({ path }) => {
    if (path.endsWith('/inbox/')) return Response.json(wireInbox);
    if (path.endsWith('/announcements/')) return Response.json([wireAnnouncement]);
    if (path.includes('/tours/') && !path.endsWith('/progress/')) return Response.json(wireTour);
    return Response.json({});
};

export function createRecordingFetch(respond: Responder = respondWithWire) {
    const requests: RecordedRequest[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        const recorded = parseRequest(request.method, request.url, await request.text());
        requests.push(recorded);
        return respond(recorded);
    };
    return { requests, fetchFn };
}

export function createHostApi(fetchFn: typeof fetch, tagTypes: string[] = []) {
    return createApi({
        baseQuery: fetchBaseQuery({ baseUrl: BASE_URL, fetchFn }),
        tagTypes,
        endpoints: () => ({}),
    });
}

export function createStoreFor<Api extends ReturnType<typeof createHostApi>>(api: Api) {
    return configureStore({
        reducer: { [api.reducerPath]: api.reducer },
        middleware: (getDefault) => getDefault().concat(api.middleware),
    });
}
