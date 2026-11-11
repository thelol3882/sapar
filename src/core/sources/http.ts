import { fromWireAnnouncement, fromWireInbox, fromWireTour, toWireProgress } from '../wire';
import type { WireAnnouncement, WireInbox, WireTour } from '../wire';
import type { Inbox, ProgressInput, SaparSource } from '../types';

export interface HttpSourceOptions {
    baseUrl: string;
    fetch?: typeof fetch;
    headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
    credentials?: RequestCredentials;
    locale?: string | (() => string);
}

export class SaparHttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'SaparHttpError';
    }
}

type Query = Record<string, string | undefined>;

function resolveValue<T>(value: T | (() => T)): T {
    return typeof value === 'function' ? (value as () => T)() : value;
}

function buildUrl(baseUrl: string, path: string, query: Query): string {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([name, value]) => value !== undefined && params.set(name, value));
    const search = params.toString();
    return `${baseUrl.replace(/\/+$/, '')}/${path}${search && `?${search}`}`;
}

export function httpSource(options: HttpSourceOptions): SaparSource {
    async function send(method: 'GET' | 'POST', path: string, query: Query = {}, body?: unknown): Promise<Response> {
        const headers = new Headers(await resolveValue(options.headers ?? {}));
        headers.set('Accept', 'application/json');
        if (body !== undefined) headers.set('Content-Type', 'application/json');

        const response = await (options.fetch ?? fetch)(buildUrl(options.baseUrl, path, query), {
            method,
            headers,
            credentials: options.credentials,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) throw new SaparHttpError(response.status, `${method} ${path} failed with ${response.status}`);
        return response;
    }

    async function getJson<T>(path: string, query: Query = {}): Promise<T> {
        const lang = options.locale === undefined ? undefined : resolveValue(options.locale);
        const response = await send('GET', path, { lang, ...query });
        return (await response.json()) as T;
    }

    async function post(path: string, body?: unknown): Promise<void> {
        await send('POST', path, {}, body);
    }

    const tourPath = (key: string): string => `tours/${encodeURIComponent(key)}/`;

    return {
        async getInbox({ route, platform }): Promise<Inbox> {
            return fromWireInbox(await getJson<WireInbox>('inbox/', { route, platform }));
        },
        async getTour(key) {
            try {
                return fromWireTour(await getJson<WireTour>(tourPath(key)));
            } catch (error) {
                if (error instanceof SaparHttpError && error.status === 404) return null;
                throw error;
            }
        },
        recordProgress: (input: ProgressInput) => post(`${tourPath(input.key)}progress/`, toWireProgress(input)),
        markSeen: (keys) => post('seen/', { keys }),
        dismiss: (key) => post('dismiss/', { key }),
        recordClick: (key) => post(`announcements/${encodeURIComponent(key)}/click/`),
        async listAnnouncements() {
            return (await getJson<WireAnnouncement[]>('announcements/')).map(fromWireAnnouncement);
        },
    };
}
