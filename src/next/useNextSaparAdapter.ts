'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { PlatformAdapter } from '../core';
import { createWebAdapter, type WebAdapterOptions } from '../web';

export type NextSaparAdapterOptions = Pick<WebAdapterOptions, 'compactBreakpointPx' | 'session'>;

/** Identity never changes; `options` are read on first render only. */
export function useNextSaparAdapter(options: NextSaparAdapterOptions = {}): PlatformAdapter {
    const router = useRouter();
    const pathname = usePathname();
    const latest = useRef({ router, pathname });
    useEffect(() => {
        latest.current = { router, pathname };
    });

    const [adapter] = useState(() =>
        createWebAdapter({
            ...options,
            navigate: (route) => latest.current.router.push(route),
            currentRoute: () => latest.current.pathname,
        }),
    );
    return adapter;
}
