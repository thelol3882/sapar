'use client';

import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import type {
    Api,
    BaseQueryFn,
    EndpointDefinitions,
    FetchArgs,
    FetchBaseQueryError,
    coreModuleName,
    reactHooksModuleName,
} from '@reduxjs/toolkit/query/react';
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { fromWireAnnouncement, fromWireInbox, fromWireTour, toWireProgress } from '../core';
import type {
    Announcement,
    Inbox,
    Platform,
    ProgressInput,
    Tour,
    SaparSource,
    WireAnnouncement,
    WireInbox,
    WireTour,
} from '../core';
import { isNotFound } from './errors';

export type SaparBaseQuery = BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>;

/** The host's own `createApi` slice, whose base query owns auth, refresh and the base URL. */
export type HostApi<
    Definitions extends EndpointDefinitions = EndpointDefinitions,
    ReducerPath extends string = string,
    TagTypes extends string = string,
> = Api<SaparBaseQuery, Definitions, ReducerPath, TagTypes, typeof coreModuleName | typeof reactHooksModuleName>;

export type SaparDispatch = ThunkDispatch<unknown, unknown, UnknownAction>;

export interface SaparRtkOptions {
    /** Prefix of the tours endpoints, relative to the host base query's base URL. Default `/tours`. */
    basePath?: string;
}

const TAG_TYPE = 'Sapar';
const INBOX_TAG = { type: TAG_TYPE, id: 'inbox' } as const;
const ALWAYS_FRESH = { subscribe: false, forceRefetch: true } as const;

const discardBody = (): void => undefined;

/**
 * Generic over the host slice so any `createApi` result is accepted; the body widens it once,
 * because RTK cannot resolve the hooks module through those generics.
 */
export function createSaparRtk<
    Definitions extends EndpointDefinitions,
    ReducerPath extends string,
    TagTypes extends string,
>(api: HostApi<Definitions, ReducerPath, TagTypes>, { basePath = '/tours' }: SaparRtkOptions = {}) {
    const root = basePath.replace(/\/+$/, '');
    const tourPath = (key: string): string => `${root}/tours/${encodeURIComponent(key)}/`;

    const injectedApi = (api as unknown as HostApi).enhanceEndpoints({ addTagTypes: [TAG_TYPE] }).injectEndpoints({
        endpoints: (builder) => ({
            getSaparInbox: builder.query<Inbox, { route?: string; platform: Platform }>({
                query: (params) => ({ url: `${root}/inbox/`, params }),
                transformResponse: (inbox: WireInbox) => fromWireInbox(inbox),
                providesTags: [INBOX_TAG],
            }),
            getTour: builder.query<Tour | null, string>({
                async queryFn(key, _api, _extraOptions, baseQuery) {
                    const { data, error } = await baseQuery(tourPath(key));
                    if (isNotFound(error)) return { data: null };
                    return error ? { error } : { data: fromWireTour(data as WireTour) };
                },
            }),
            getAnnouncements: builder.query<Announcement[], void>({
                query: () => `${root}/announcements/`,
                transformResponse: (announcements: WireAnnouncement[]) => announcements.map(fromWireAnnouncement),
            }),
            markAnnouncementsSeen: builder.mutation<void, string[]>({
                query: (keys) => ({ url: `${root}/seen/`, method: 'POST', body: { keys } }),
                transformResponse: discardBody,
                invalidatesTags: [INBOX_TAG],
            }),
            dismissAnnouncement: builder.mutation<void, string>({
                query: (key) => ({ url: `${root}/dismiss/`, method: 'POST', body: { key } }),
                transformResponse: discardBody,
                invalidatesTags: [INBOX_TAG],
            }),
            recordAnnouncementClick: builder.mutation<void, string>({
                query: (key) => ({ url: `${root}/announcements/${encodeURIComponent(key)}/click/`, method: 'POST' }),
                transformResponse: discardBody,
            }),
            recordTourProgress: builder.mutation<void, ProgressInput>({
                query: (input) => ({
                    url: `${tourPath(input.key)}progress/`,
                    method: 'POST',
                    body: toWireProgress(input),
                }),
                transformResponse: discardBody,
                invalidatesTags: [INBOX_TAG],
            }),
        }),
    });

    const { endpoints } = injectedApi;
    const {
        useGetSaparInboxQuery,
        useLazyGetSaparInboxQuery,
        useGetTourQuery,
        useLazyGetTourQuery,
        useGetAnnouncementsQuery,
        useMarkAnnouncementsSeenMutation,
        useDismissAnnouncementMutation,
        useRecordAnnouncementClickMutation,
        useRecordTourProgressMutation,
    } = injectedApi;

    function createSource(dispatch: SaparDispatch): SaparSource {
        return {
            getInbox: (query) => dispatch(endpoints.getSaparInbox.initiate(query, ALWAYS_FRESH)).unwrap(),
            getTour: (key) => dispatch(endpoints.getTour.initiate(key, ALWAYS_FRESH)).unwrap(),
            listAnnouncements: () => dispatch(endpoints.getAnnouncements.initiate(undefined, ALWAYS_FRESH)).unwrap(),
            recordProgress: (input) => dispatch(endpoints.recordTourProgress.initiate(input)).unwrap(),
            markSeen: (keys) => dispatch(endpoints.markAnnouncementsSeen.initiate(keys)).unwrap(),
            dismiss: (key) => dispatch(endpoints.dismissAnnouncement.initiate(key)).unwrap(),
            recordClick: (key) => dispatch(endpoints.recordAnnouncementClick.initiate(key)).unwrap(),
        };
    }

    function useSaparSource(): SaparSource {
        const dispatch = useDispatch<SaparDispatch>();
        return useMemo(() => createSource(dispatch), [dispatch]);
    }

    return {
        api: injectedApi,
        useGetSaparInboxQuery,
        useLazyGetSaparInboxQuery,
        useGetTourQuery,
        useLazyGetTourQuery,
        useGetAnnouncementsQuery,
        useMarkAnnouncementsSeenMutation,
        useDismissAnnouncementMutation,
        useRecordAnnouncementClickMutation,
        useRecordTourProgressMutation,
        createSource,
        useSaparSource,
    };
}
